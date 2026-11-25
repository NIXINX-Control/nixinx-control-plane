import {NextRequest} from "next/server";
import {superadminUser,db,ok,fail,ApiError} from "@/lib/server";
import {existingIdPattern} from "@/lib/client-provisioning";
import {buildClientInstallationPreview} from "@/lib/client-installation-preview";
import {parseHostnameApproval,hostnameIdentity,matchesHostnameDraft,decideHostnameDraft} from "@/lib/client-hostname-draft";
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
   let confirmedHostname:string|undefined;
   if(d.hostnameBinding){
    try{
     const input=parseHostnameApproval({tenantId:id,appId:d.appId,hostname:d.hostnameBinding.hostname,confirmed:true});
     const identity=hostnameIdentity(input,d);
     const [cfg,inst,candidates,bindings]=await Promise.all([
      tx.get(db.collection("configurations").doc(input.hostname)),tx.get(db.collection("appInstallations").doc(input.hostname)),
      tx.get(db.collection("clientProvisioning").where("hostname","==",input.hostname).limit(3)),tx.get(db.collection("clientProvisioning").where("hostnameBinding.hostname","==",input.hostname).limit(3))]);
     if(matchesHostnameDraft(d.hostnameBinding,identity)&&decideHostnameDraft(identity,d.hostnameBinding,[...candidates.docs,...bindings.docs].map(x=>({id:x.id,data:x.data()})),cfg.exists||inst.exists)==="REUSE")confirmedHostname=input.hostname;
    }catch{ /* Conflict or invalid evidence: keep hostname blocked. */ }
   }
   try{return buildClientInstallationPreview(id,d,t.data(),app.data(),owner?.data(),license.data(),confirmedHostname)}catch{throw new ApiError(409,"CLIENT_PLAN_INTAKE_NOT_ELIGIBLE")}
  },{readOnly:true});
  return ok(result);
 }catch(e){return fail(e)}
}
