import {NextRequest} from "next/server";
import {adminUser,staffIdentity,db,ok,fail,identifier,str,ApiError} from "@/lib/server";
import {appModuleDocId,isNewCatalogId,normalizeSelectedModules,validateSelectedModules} from "@/lib/catalog";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(req:NextRequest){
  try {
    const {role}=await staffIdentity(req);
    const sources=["tenants","apps","appModules","licenses","audit"] as const;
    const [tenants,apps,modules,licenses,logs]=await Promise.all(sources.map(async collection=>{
      const snap=await db.collection(collection).limit(collection==="audit"?50:500).get();
      return snap.docs.map(doc=>({id:doc.id,...doc.data()}));
    }));
    return ok({tenants,apps,modules,licenses,logs,viewerRole:role});
  }catch(error){return fail(error);}
}

export async function POST(req:NextRequest){
  try {
    const actor=await adminUser(req);
    const body=await req.json().catch(()=>{throw new ApiError(400,"Invalid JSON")});
    if(!body||typeof body!=="object"||Array.isArray(body))throw new ApiError(400,"Invalid record");
    const kind=str(body.kind,30);
    if(!["tenants","apps","modules","licenses"].includes(kind))throw new ApiError(400,"Unsupported record");
    const id=identifier(body.id);
    if(kind!=="licenses"&&!isNewCatalogId(id))throw new ApiError(400,"Use a lowercase ID with letters, digits and hyphens (2-39 characters)");
    const appId=kind==="modules"?identifier(body.appId):kind==="licenses"?identifier(body.appId):"";
    const tenantId=kind==="licenses"?identifier(body.tenantId):"";
    const collection=kind==="modules"?"appModules":kind;
    const documentId=kind==="modules"?appModuleDocId(appId,id):id;
    const ref=db.collection(collection).doc(documentId);
    const at=new Date().toISOString();

    let record:Record<string,unknown>={};
    if(kind==="tenants")record={name:str(body.name),status:"active",createdAt:at};
    if(kind==="apps")record={name:str(body.name),description:typeof body.description==="string"?body.description.trim().slice(0,300):"",status:"active",createdAt:at};
    if(kind==="modules")record={appId,moduleId:id,name:str(body.name),status:"draft",verified:false,createdAt:at};
    let modules:string[]=[];
    if(kind==="licenses"){
      if(id!==tenantId+"_"+appId)throw new ApiError(400,"License ID must be tenantId_appId");
      if(!Number.isFinite(Date.parse(str(body.validUntil,40))))throw new ApiError(400,"Invalid validity date");
      if(!Number.isInteger(body.graceDays)||body.graceDays<0||body.graceDays>90)throw new ApiError(400,"Grace period must be 0-90 days");
      try{modules=normalizeSelectedModules(body.modules);}catch{throw new ApiError(400,"Modules must be selected from the registered catalog without duplicates");}
      record={tenantId,appId,status:"pending",validUntil:body.validUntil,graceDays:body.graceDays,modules,createdAt:at};
    }

    await db.runTransaction(async tx=>{
      // Document ID is the canonical key. Creation is atomic and never overwrites an existing record.
      const current=await tx.get(ref);
      if(current.exists)throw new ApiError(409,"Identifier already exists and cannot be reused");
      if(kind==="tenants"||kind==="apps"){
        // Historical IDs may have any case. Preserve them and prevent case-only duplicate identities.
        const existing=await tx.get(db.collection(collection).limit(501));
        if(existing.size>500)throw new ApiError(409,"Catalog too large for case-insensitive identity precheck");
        if(existing.docs.some(doc=>doc.id.toLowerCase()===id.toLowerCase()))
          throw new ApiError(409,"Identifier already exists (case-insensitive) and cannot be reused");
      }
      if(kind==="modules"){
        const app=await tx.get(db.collection("apps").doc(appId));
        if(!app.exists||app.data()?.status==="archived")throw new ApiError(400,"An active application is required");
      }
      if(kind==="licenses"){
        const [tenant,app,...moduleSnapshots]=await Promise.all([
          tx.get(db.collection("tenants").doc(tenantId)),
          tx.get(db.collection("apps").doc(appId)),
          ...modules.map(m=>tx.get(db.collection("appModules").doc(appModuleDocId(appId,m))))
        ]);
        if(!tenant.exists||tenant.data()?.status!=="active"||!app.exists||app.data()?.status==="archived")
          throw new ApiError(400,"Active tenant and application are required");
        try{validateSelectedModules(modules,appId,moduleSnapshots.map(x=>x.data()));}
        catch{throw new ApiError(400,"Selected module does not exist or is inactive for this application");}
      }
      tx.create(ref,record);
      tx.create(db.collection("audit").doc(),{actor,action:"CREATE_"+kind.toUpperCase(),target:documentId,at});
    });
    return ok({id:documentId,...record},201);
  }catch(error){return fail(error);}
}
