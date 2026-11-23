import {NextRequest} from "next/server";
import {adminUser,db,ok,fail,identifier,str,ApiError} from "@/lib/server";
import {permittedTransition,localDayBoundary,suspensionEffective,tenantTimeZone,Lifecycle} from "@/lib/lifecycle";
import {appModuleDocId,normalizeSelectedModules,validateSelectedModules} from "@/lib/catalog";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try {
    const actor=await adminUser(req);
    const id=identifier((await params).id);
    const body=await req.json().catch(()=>{throw new ApiError(400,"Invalid JSON")});
    if(!body||typeof body!=="object"||Array.isArray(body))throw new ApiError(400,"Invalid request");
    if(Object.keys(body).some(k=>!["status","validUntil","graceDays","modules","reason"].includes(k)))
      throw new ApiError(400,"License ID, client and application cannot be changed");
    const reason=str(body.reason,500);
    const hasTransition=body.status!==undefined;
    const pauseNow=body.status==="pause_now";
    const hasTerms=["validUntil","graceDays","modules"].some(k=>body[k]!==undefined);
    if(hasTransition===hasTerms)throw new ApiError(400,"Change status OR license terms in a separate operation");

    const changes:Record<string,unknown>={};
    if(hasTransition){
      const next=(pauseNow?"suspended":str(body.status,30)) as Lifecycle;
      if(!["pending","active","grace","suspended","terminated"].includes(next))
        throw new ApiError(400,"Invalid license status");
      changes.status=next;
    }
    if(body.validUntil!==undefined){
      const value=body.validUntil===null?null:str(body.validUntil,40);
      if(value!==null&&!Number.isFinite(Date.parse(value)))throw new ApiError(400,"Invalid date");
      changes.validUntil=value;
    }
    if(body.graceDays!==undefined){
      if(!Number.isInteger(body.graceDays)||body.graceDays<0||body.graceDays>90)
        throw new ApiError(400,"Grace period must be 0-90 days");
      changes.graceDays=body.graceDays;
    }
    if(body.modules!==undefined){
      try{changes.modules=normalizeSelectedModules(body.modules);}
      catch{throw new ApiError(400,"Invalid, repeated or unknown module IDs");}
    }
    const ref=db.collection("licenses").doc(id);
    const at=new Date().toISOString();
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw new ApiError(404,"License missing");
      const previous=snap.data()!;
      if(id!==previous.tenantId+"_"+previous.appId)throw new ApiError(409,"License assignment inconsistent");
      if(hasTransition){
        const now=new Date(at);
        const from=suspensionEffective(previous.suspensionAt,now)?"suspended":previous.status as Lifecycle;
        const next=changes.status as Lifecycle;
        const cancelPending=next==="active"&&from==="active"&&typeof previous.suspensionAt==="string";
        if(!cancelPending&&!permittedTransition(from,next))throw new ApiError(409,"Invalid status transition");
        if(pauseNow){
          changes.suspensionAt=null;
        }else if(next==="suspended"){
          const tenant=await tx.get(db.collection("tenants").doc(previous.tenantId));
          const zone=tenantTimeZone(tenant.data()?.timeZone);
          if(!zone)throw new ApiError(409,"Configure the client time zone before scheduling a suspension");
          changes.status=previous.status;
          changes.suspensionAt=previous.suspensionAt??localDayBoundary(now,zone,1).toISOString();
        }else if(next==="active"||next==="terminated"){
          changes.suspensionAt=null;
        }
      }else{
        if(previous.status==="terminated")throw new ApiError(409,"Terminated license cannot be modified");
        if(changes.modules!==undefined){
          const ids=changes.modules as string[];
          const docs=await Promise.all(ids.map(mid=>tx.get(db.collection("appModules").doc(appModuleDocId(previous.appId,mid)))));
          try{validateSelectedModules(ids,previous.appId,docs.map(x=>x.data()));}
          catch{throw new ApiError(400,"Select modules registered and active for this application");}
        }
      }
      tx.update(ref,{...changes,updatedAt:at});
      tx.create(db.collection("audit").doc(),{
        actor,action:pauseNow?"LICENSE_PAUSED_IMMEDIATELY":hasTransition?"LICENSE_TRANSITION":"UPDATE_LICENSE_TERMS",target:id,
        previousStatus:previous.status,nextStatus:pauseNow?"suspended":body.status??previous.status,effectiveAt:changes.suspensionAt??at,
        changedFields:Object.keys(changes),reason,at
      });
    });
    return ok({id,updated:true,...changes});
  }catch(error){return fail(error);}
}

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try {
    const actor=await adminUser(req);
    const id=identifier((await params).id);
    const body=await req.json().catch(()=>{throw new ApiError(400,"Invalid JSON")});
    if(!body||typeof body!=="object"||Array.isArray(body)||
      Object.keys(body).some(key=>!["reason","validUntil"].includes(key)))
      throw new ApiError(400,"Invalid request");
    const reason=str(body.reason,500);
    const requestedExpiry=body.validUntil===undefined?undefined:str(body.validUntil,40);
    const ref=db.collection("licenses").doc(id);
    const audit=db.collection("audit").doc();
    const history=ref.collection("terminatedLicenses").doc(audit.id);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw new ApiError(404,"License missing");
      const previous=snap.data()!;
      if(id!==previous.tenantId+"_"+previous.appId)throw new ApiError(409,"License assignment inconsistent");
      if(previous.status!=="terminated")throw new ApiError(409,"Solo puede emitirse un reemplazo para una licencia terminada");

      const now=new Date();
      const at=now.toISOString();
      const validUntil=requestedExpiry??previous.validUntil;
      if(validUntil!==null&&(typeof validUntil!=="string"||
        !Number.isFinite(Date.parse(validUntil))||Date.parse(validUntil)<=now.getTime()))
        throw new ApiError(400,"Indica una fecha de vencimiento futura para la nueva licencia");

      const {tenantId,appId,graceDays,modules}=previous;
      tx.create(history,{license:previous,replacedAt:at,replacedBy:actor,reason});
      tx.set(ref,{
        tenantId,appId,graceDays,modules,validUntil,status:"active",
        suspensionAt:null,createdAt:at,updatedAt:at,replaces:history.id
      });
      tx.create(audit,{
        actor,action:"LICENSE_REISSUED",target:id,previousStatus:"terminated",nextStatus:"active",
        historicalLicense:history.path,effectiveAt:at,reason,at
      });
    });
    return ok({id,status:"active"});
  }catch(error){return fail(error);}
}
