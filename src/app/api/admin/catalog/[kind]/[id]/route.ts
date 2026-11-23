import {NextRequest} from "next/server";
import {adminUser,db,ok,fail,identifier,str,ApiError} from "@/lib/server";
import {localDayBoundary,tenantTimeZone} from "@/lib/lifecycle";
import {acceptsCatalogStatus} from "@/lib/catalog";

export const runtime="nodejs";
export const dynamic="force-dynamic";

type Kind="tenants"|"apps"|"modules";

export async function PATCH(req:NextRequest,{params}:{params:Promise<{kind:string;id:string}>}){
  try {
    const actor=await adminUser(req);
    const p=await params;
    if(!["tenants","apps","modules"].includes(p.kind))throw new ApiError(404,"Catalog not found");
    const kind=p.kind as Kind;
    const docId=kind==="modules"?p.id:identifier(p.id);
    if(kind==="modules"&&!/^[A-Za-z0-9_-]{2,80}\.[a-z][a-z0-9-]{1,62}$/.test(docId))
      throw new ApiError(400,"Invalid module reference");
    const ref=db.collection(kind==="modules"?"appModules":kind).doc(docId);
    const body=await req.json().catch(()=>{throw new ApiError(400,"Invalid JSON")});
    if(!body||typeof body!=="object"||Array.isArray(body))throw new ApiError(400,"Invalid edit request");
    const allowed=["name","description","status","reason","timeZone","serviceAction"];
    if(Object.keys(body).some(key=>!allowed.includes(key)))
      throw new ApiError(400,"IDs and application bindings are immutable");
    const reason=str(body.reason,500);
    const changes:Record<string,unknown>={};
    if(body.name!==undefined)changes.name=str(body.name);
    if(body.description!==undefined){
      if(kind!=="apps"||typeof body.description!=="string"||body.description.length>300)
        throw new ApiError(400,"Invalid application description");
      changes.description=body.description.trim();
    }
    if(body.status!==undefined){
      if(!acceptsCatalogStatus(kind,body.status))throw new ApiError(400,"Invalid catalog status");
      changes.status=body.status;
    }
    if(body.timeZone!==undefined){
      const zone=tenantTimeZone(body.timeZone);
      if(kind!=="tenants"||!zone)throw new ApiError(400,"Invalid client time zone");
      changes.timeZone=zone;
    }
    const serviceAction=body.serviceAction;
    if(serviceAction!==undefined&&(kind!=="tenants"||!["active","suspended","terminated"].includes(serviceAction)))
      throw new ApiError(400,"Invalid client service action");
    if(Object.keys(changes).length===0&&serviceAction===undefined)throw new ApiError(400,"No changes submitted");

    const at=new Date().toISOString();
    await db.runTransaction(async tx=>{
      const current=await tx.get(ref);
      if(!current.exists)throw new ApiError(404,"Catalog record missing");
      const previous=current.data()!;
      if(kind==="modules" && changes.status==="active" && previous.verified!==true)throw new ApiError(409,"Module must match a verified application manifest before activation");
      if(kind==="modules" && docId!==previous.appId+"."+previous.moduleId)
        throw new ApiError(409,"Module reference inconsistent");

      if((kind==="modules"&&changes.status==="retired") || (kind!=="modules"&&changes.status==="archived")){
        const filterField=kind==="tenants"?"tenantId":"appId";
        const filterId=kind==="modules"?previous.appId:docId;
        const snap=await tx.get(db.collection("licenses").where(filterField,"==",filterId).limit(201));
        if(snap.size>200)throw new ApiError(409,"Too many linked licenses to archive safely");
        const inUse=snap.docs.some(doc=>{
          const license=doc.data();
          if(license.status==="terminated")return false;
          if(kind==="modules")return Array.isArray(license.modules)&&license.modules.includes(previous.moduleId);
          return true;
        });
        if(inUse)throw new ApiError(409,"Catalog record is referenced by an unterminated license");

        if(kind!=="modules"){
          const configs=await tx.get(db.collection("configurations").where(kind==="tenants"?"tenantId":"appId","==",docId).limit(1));
          if(!configs.empty)throw new ApiError(409,"Catalog record has configuration bindings");
        }
      }
      if(serviceAction!==undefined){
        if(previous.servicesTerminatedAt)throw new ApiError(409,"Client services are terminated");
        if(serviceAction==="suspended"){
          const zone=tenantTimeZone(changes.timeZone??previous.timeZone);
          if(!zone)throw new ApiError(409,"Configure the client time zone before scheduling a suspension");
          changes.servicesSuspensionAt=previous.servicesSuspensionAt??localDayBoundary(new Date(at),zone,1).toISOString();
        }else{
          changes.servicesSuspensionAt=null;
          if(serviceAction==="terminated")changes.servicesTerminatedAt=at;
        }
      }
      tx.update(ref,{...changes,updatedAt:at});
      tx.create(db.collection("audit").doc(),{
        actor,action:"UPDATE_"+kind.toUpperCase(),target:docId,
        changedFields:Object.keys(changes),previousStatus:previous.status??null,
        nextStatus:changes.status??previous.status??null,serviceAction:serviceAction??null,
        effectiveAt:changes.servicesSuspensionAt??at,reason,at
      });
    });
    return ok({id:docId,updated:true});
  }catch(error){return fail(error);}
}
