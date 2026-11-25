import {NextRequest} from "next/server";
import {superadminUser,db,ok,fail,ApiError} from "@/lib/server";
import {existingIdPattern} from "@/lib/client-provisioning";
import {buildClientInstallationPreview} from "@/lib/client-installation-preview";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 try{
  await superadminUser(req);
  if(process.env.VERCEL_ENV!=="production")throw new ApiError(409,"CLIENT_PLAN_PRODUCTION_ONLY");
  const id=req.nextUrl.searchParams.get("tenantId")||"";
  if(!existingIdPattern.test(id)||[...req.nextUrl.searchParams.keys()].some(k=>k!=="tenantId")||req.nextUrl.searchParams.getAll("tenantId").length!==1)throw new ApiError(400,"CLIENT_PLAN_INPUT_INVALID");
  const result=await db.runTransaction(async tx=>{
   const [draft,t]=await Promise.all([tx.get(db.collection("clientProvisioning").doc(id)),tx.get(db.collection("tenants").doc(id))]);
   const d=draft.data();
   if(!d||d.tenantId!==id||typeof d.appId!=="string"||! /^[a-z][a-z0-9-]{0,37}[a-z0-9]$/.test(d.appId))throw new ApiError(409,"CLIENT_PLAN_INTAKE_NOT_ELIGIBLE");
   const project=d.googleBinding?.projectId;
   const [app,owner,license]=await Promise.all([
    tx.get(db.collection("apps").doc(d.appId)),
    typeof project==="string"&&/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)?tx.get(db.collection("firebaseProjectOwners").doc(project)):Promise.resolve(undefined),
    tx.get(db.collection("licenses").doc(id+"_"+d.appId))
   ]);
   try{return buildClientInstallationPreview(id,d,t.data(),app.data(),owner?.data(),license.data())}catch{throw new ApiError(409,"CLIENT_PLAN_INTAKE_NOT_ELIGIBLE")}
  },{readOnly:true});
  return ok(result);
 }catch(e){return fail(e)}
}
