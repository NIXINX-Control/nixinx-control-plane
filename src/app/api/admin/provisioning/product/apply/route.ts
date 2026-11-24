import {NextRequest} from "next/server";
import {superadminUser,db,ok,fail,ApiError} from "@/lib/server";
import {parseProductDiscoveryInput} from "@/lib/product-discovery";
import {discoverProduct,DiscoveryUnavailable} from "@/lib/product-discovery-provider";
import {prepareProductRegistration} from "@/lib/product-registration-plan";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 try{
  const actor=await superadminUser(req);
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!["appId","repository","vercelProjectId","confirmationDigest","adoptExisting"].includes(k))||typeof body.confirmationDigest!=="string"||! /^[a-f0-9]{64}$/.test(body.confirmationDigest)||typeof body.adoptExisting!=="boolean")throw new ApiError(400,"Invalid registration confirmation");
  let input;
  try{input=parseProductDiscoveryInput({appId:body.appId,repository:body.repository,vercelProjectId:body.vercelProjectId})}catch{throw new ApiError(400,"Invalid product discovery input")}
  let discovery;
  try{discovery=await discoverProduct(input)}catch(e){if(e instanceof DiscoveryUnavailable)throw new ApiError(503,"Product provider discovery unavailable");throw new ApiError(409,"Product binding or requirements could not be verified")}
  const at=new Date().toISOString();
  const receipt=await db.runTransaction(async tx=>{
   const [apps,modules]=await Promise.all([tx.get(db.collection("apps").limit(501)),tx.get(db.collection("appModules").limit(501))]);
   if(apps.size>500||modules.size>500)throw new ApiError(409,"Catalog exceeds safe registration limit");
   const p=prepareProductRegistration(discovery,{apps:apps.docs.map(x=>({id:x.id,data:x.data()})),modules:modules.docs.map(x=>({id:x.id,data:x.data()}))},discovery.release);
   if(!p.canRegister||!p.mutation.binding)throw new ApiError(409,"Registration blocked: "+p.problems.join(", "));
   if(p.alreadyRegistered)return {status:"ALREADY_REGISTERED",writes:0,appId:input.appId,sourceCommit:discovery.sourceCommit};
   if(p.confirmationDigest!==body.confirmationDigest)throw new ApiError(409,"Plan changed; generate a new plan");
   if(p.requiresExistingAppAdoption&&!body.adoptExisting)throw new ApiError(409,"Explicit existing application adoption required");
   const ref=db.collection("apps").doc(input.appId);
   // active is the existing catalog status, not technical readiness or a customer entitlement.
   if(p.mutation.createApp)tx.create(ref,{name:discovery.manifest.applicationName,description:"",status:"active",createdAt:at,provisioning:p.mutation.binding});
   else if(p.mutation.writeBinding)tx.update(ref,{provisioning:p.mutation.binding});
   for(const m of p.mutation.moduleCreates)tx.create(db.collection("appModules").doc(m.id),{...m.data,createdAt:at});
   tx.create(db.collection("audit").doc(),{actor,action:"REGISTER_PRODUCT",target:input.appId,at,sourceCommit:discovery.sourceCommit,repository:input.repository,vercelProjectId:input.vercelProjectId,modulesCreated:p.mutation.moduleCreates.map(m=>m.id)});
   return {status:"REGISTERED",appId:input.appId,sourceCommit:discovery.sourceCommit,writes:Number(p.mutation.createApp||p.mutation.writeBinding)+p.mutation.moduleCreates.length+1};
  });
  // Independent readback after commit. If unavailable, repeat PLAN before retrying.
  const app=await db.collection("apps").doc(input.appId).get();
  const actual=app.data()?.provisioning;
  const moduleReads=await Promise.all(discovery.manifest.modules.map(m=>db.collection("appModules").doc(input.appId+"."+m.id).get()));
  const verified=app.exists&&actual?.repository===input.repository&&actual?.vercelProjectId===input.vercelProjectId&&actual?.sourceCommit===discovery.sourceCommit&&moduleReads.every((m,i)=>m.exists&&m.data()?.appId===input.appId&&m.data()?.moduleId===discovery.manifest.modules[i].id);
  if(!verified)throw new ApiError(409,"Registration readback not verified; generate a new plan");
  return ok({...receipt,readbackVerified:true,technicalReady:false,commercialAuthorized:false});
 }catch(e){return fail(e)}
}
