import {NextRequest} from "next/server";
import {superadminUser,db,ok,fail,ApiError} from "@/lib/server";
import {parseIntake,legalKey,decideIntake,buildIntakeRequirements,sameIntake} from "@/lib/client-provisioning";
import {parseProductManifest} from "@/lib/product-discovery";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const collection="clientProvisioning";
const safeId=/^[a-z][a-z0-9-]{0,37}[a-z0-9]$/;
export async function GET(req:NextRequest){
 try{
  await superadminUser(req);
  const tenantId=req.nextUrl.searchParams.get("tenantId");
  if(tenantId!==null){
   if(!safeId.test(tenantId))throw new ApiError(400,"ID de cliente inválido");
   const snap=await db.collection(collection).doc(tenantId).get();
   if(!snap.exists)throw new ApiError(404,"Expediente no encontrado");
   return ok({intake:snap.data()});
  }
  const snap=await db.collection(collection).limit(201).get();
  return ok({intakes:snap.docs.slice(0,200).map(d=>({tenantId:d.id,appId:d.data().appId,status:d.data().status})),truncated:snap.size>200});
 }catch(e){return fail(e)}
}
export async function POST(req:NextRequest){
 try{
  const actor=await superadminUser(req);
  if(process.env.VERCEL_ENV!=="production")throw new ApiError(409,"El expediente requiere el entorno de producción de Control");
  let input;
  try{input=parseIntake(await req.json())}catch{throw new ApiError(400,"Completa los campos válidos del expediente; no se admiten campos adicionales")}
  const ref=db.collection(collection).doc(input.tenantId),at=new Date().toISOString();
  const result=await db.runTransaction(async tx=>{
   const [prior,tenants,drafts,app]=await Promise.all([tx.get(ref),tx.get(db.collection("tenants").limit(501)),tx.get(db.collection(collection).limit(501)),tx.get(db.collection("apps").doc(input.appId))]);
   if(tenants.size>500||drafts.size>500)throw new ApiError(409,"Límite de conciliación alcanzado; no crear duplicados");
   let action;
   try{action=decideIntake(input,prior.data(),tenants.docs.map(d=>d.id),drafts.docs.filter(d=>d.id!==input.tenantId).map(d=>d.data().legalKey).filter((v):v is string=>typeof v==="string"))}catch(e){throw new ApiError(409,(e as Error).message)}
   if(action==="REUSE")return {status:"ALREADY_SAVED",writes:0};
   const binding=app.data()?.provisioning;
   if(app.data()?.status!=="active"||!binding)throw new ApiError(409,"Producto no registrado técnicamente");
   let requirements;
   try{requirements=buildIntakeRequirements(input.appId,binding,parseProductManifest(binding.manifest,input.appId))}catch{throw new ApiError(409,"Requisitos del producto no verificados")}
   const record={schemaVersion:1,tenantId:input.tenantId,appId:input.appId,profile:input,legalKey:legalKey(input),hostname:input.tenantId+"."+input.appId+".nixinx.app",status:"PRELIMINARY",requirements,legalIdentityVerified:false,delegationVerified:false,technicalReady:false,commercialAuthorized:false,createdAt:at,createdBy:actor};
   tx.create(ref,record);
   tx.create(db.collection("audit").doc(),{actor,action:"CREATE_CLIENT_PROVISIONING_INTAKE",target:input.tenantId,appId:input.appId,at});
   return {status:"SAVED",writes:2};
  });
  const actual=(await ref.get()).data();
  if(!actual||!sameIntake(actual.profile,input)||actual.technicalReady!==false||actual.commercialAuthorized!==false)throw new ApiError(409,"Readback no verificado; consultar expediente antes de reintentar");
  return ok({...result,readbackVerified:true,intake:actual},result.writes?201:200);
 }catch(e){return fail(e)}
}
