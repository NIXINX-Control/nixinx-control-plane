import {NextRequest} from "next/server";
import {staffIdentity,db,ok,fail,ApiError,str} from "@/lib/server";
import {validateInstallationInput,verifyInstallationManifest} from "@/lib/installation-verification";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(req:NextRequest){
 try{
  await staffIdentity(req);
  const snap=await db.collection("appInstallations").limit(500).get();
  return ok({environment:process.env.VERCEL_ENV,hostname:process.env.VERCEL_ENV==="production"?process.env.NIXINX_CONTROL_CORPORATE_PRODUCTION_HOSTNAME:undefined,installations:snap.docs.map(d=>({id:d.id,...d.data()}))});
 }catch(e){return fail(e)}
}
export async function POST(req:NextRequest){
 try{
  const {uid,role}=await staffIdentity(req);
  const environment=process.env.VERCEL_ENV;
  if(environment==="production"){
   if(role!=="superadmin")throw new ApiError(403,"Se requiere un superadministrador.");
   const input=validateInstallationInput(await req.json().catch(()=>null));
   const firebaseProjectId=process.env.NIXINX_CONTROL_CORPORATE_FIREBASE_PROJECT_ID;
   const orgId=process.env.NIXINX_CONTROL_CORPORATE_ORG_ID;
   if(!firebaseProjectId||firebaseProjectId.startsWith("nixinx-")||!orgId||! /^[a-zA-Z0-9_-]{2,80}$/.test(orgId)||
      input.hostname!==process.env.NIXINX_CONTROL_CORPORATE_PRODUCTION_HOSTNAME||
      input.tenantId!==process.env.NIXINX_CONTROL_CORPORATE_PRODUCTION_TENANT_ID)
    throw new ApiError(409,"El cliente y el dominio deben coincidir con la configuración de producción.");
   const record={...input,appId:"corporate",environment,firebaseProjectId,orgId,status:"active",verified:true};
   const at=new Date().toISOString();
   await db.runTransaction(async tx=>{
    const ref=db.collection("appInstallations").doc(input.hostname);
    const [prior,tenant,app]=await Promise.all([
     tx.get(ref),tx.get(db.collection("tenants").doc(input.tenantId)),tx.get(db.collection("apps").doc("corporate"))
    ]);
    if(tenant.data()?.status!=="active"||app.data()?.status!=="active")
     throw new ApiError(409,"El cliente y la aplicación Corporate deben estar activos.");
    const existing=prior.data();
    if(existing&&["tenantId","appId","hostname","environment","firebaseProjectId","orgId"].some(
      key=>existing[key]!==record[key as keyof typeof record]))
     throw new ApiError(409,"La instalación existente tiene una asignación distinta.");
    tx.set(ref,{...record,createdAt:existing?.createdAt??at,verifiedBy:uid,verifiedAt:at},{merge:true});
    tx.create(db.collection("audit").doc(),{actor:uid,action:"REGISTER_CORPORATE_PRODUCTION_INSTALLATION",target:input.hostname,tenantId:input.tenantId,at});
   });
   return ok({installation:record});
  }
  if(environment!=="preview")throw new ApiError(409,"Entorno de instalación no admitido.");
  const input=validateInstallationInput(await req.json().catch(()=>null));
  const bypass=process.env.NIXINX_CORPORATE_PREVIEW_PROTECTION_BYPASS;
  const headers:Record<string,string>={"Accept":"application/json"};
  if(process.env.VERCEL_ENV==="preview"&&input.hostname==="nelcy-preview.corporate.nixinx.app"&&bypass){
   headers["x-vercel-protection-bypass"]=bypass;
  }
  const check=await fetch("https://"+input.hostname+"/api/internal/installation-manifest",{
   method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000),
   headers
  }).catch(()=>{throw new ApiError(503,"Corporate Preview is not available for verification")});
  if(!check.ok)throw new ApiError(409,"Corporate Preview is not ready for verification");
  const claimed=await check.json().catch(()=>null);
  let record:ReturnType<typeof verifyInstallationManifest>;
  try{
   record=verifyInstallationManifest(input,process.env.NIXINX_CONTROL_CORPORATE_SANDBOX_PROJECT_ID,claimed);
  }catch{throw new ApiError(409,"The Corporate installation does not match the authorized sandbox");}
  const now=new Date().toISOString();
  await db.runTransaction(async tx=>{
   const doc=db.collection("appInstallations").doc(record.hostname);
   const [previous,tenant,app]=await Promise.all([
    tx.get(doc),tx.get(db.collection("tenants").doc(record.tenantId)),
    tx.get(db.collection("apps").doc("corporate"))
   ]);
   if(!tenant.exists||tenant.data()?.status!=="active"||!app.exists||app.data()?.status!=="active")
    throw new ApiError(409,"Active tenant and Corporate catalog application required");
   if(previous.exists){
    const old=previous.data()!;
    if(old.tenantId!==record.tenantId||old.appId!=="corporate"||old.environment!=="preview"||
       (old.firebaseProjectId&&old.firebaseProjectId!==record.firebaseProjectId)||
       (old.sandboxOrgId&&old.sandboxOrgId!==record.sandboxOrgId))
     throw new ApiError(409,"Installation binding is immutable");
    tx.update(doc,{status:"active",verified:true,verifiedAt:now,verifiedBy:uid});
   }else{
    tx.create(doc,{...record,createdAt:now,verifiedAt:now,verifiedBy:uid});
   }
   tx.create(db.collection("audit").doc(),{
    actor:uid,action:"VERIFY_CORPORATE_PREVIEW_INSTALLATION",
    target:record.hostname,tenantId:record.tenantId,at:now
   });
  });
  return ok({installation:record});
 }catch(e){return fail(e);}
}
export async function PATCH(req:NextRequest){
 try{
  const {uid,role}=await staffIdentity(req);
  const environment=process.env.VERCEL_ENV;
  if(environment!=="preview"&&environment!=="production")throw new ApiError(409,"Entorno de instalación no admitido.");
  if(environment==="production"&&role!=="superadmin")throw new ApiError(403,"Se requiere un superadministrador.");
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=="object"||Array.isArray(body))
    throw new ApiError(400,"Invalid request");
  const b=body as Record<string,unknown>;
  if(Object.keys(b).some(k=>!["hostname","reason"].includes(k)))
    throw new ApiError(400,"Only installation disable is permitted");
  const input=validateInstallationInput({hostname:b.hostname,tenantId:"xx"});
  const reason=str(b.reason,500),now=new Date().toISOString();
  await db.runTransaction(async tx=>{
   const doc=db.collection("appInstallations").doc(input.hostname);
   const existing=await tx.get(doc);
   if(!existing.exists||existing.data()?.appId!=="corporate"||existing.data()?.environment!==environment)
    throw new ApiError(404,"Corporate installation not found");
   tx.update(doc,{status:"disabled",verified:false,updatedAt:now});
   tx.create(db.collection("audit").doc(),{actor:uid,action:environment==="production"?"DISABLE_CORPORATE_PRODUCTION_INSTALLATION":"DISABLE_CORPORATE_PREVIEW_INSTALLATION",target:input.hostname,reason,at:now});
  });
  return ok({disabled:true});
 }catch(e){return fail(e)}
}
