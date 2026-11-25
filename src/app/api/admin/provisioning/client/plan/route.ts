import {NextRequest} from "next/server";
import {superadminUser,db,ok,fail,ApiError} from "@/lib/server";
import {clientProviderPreflight} from "@/lib/client-provider-preflight-provider";
import {existingIdPattern} from "@/lib/client-provisioning";
import {buildClientInstallationPreview} from "@/lib/client-installation-preview";
import {canonicalHostname,hostnameIdentity,inspectCanonicalHostname,canonicalTenantDnsSlug,assertTenantDnsIdentity} from "@/lib/client-hostname-draft";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
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
   const preliminary=buildClientInstallationPreview(id,d,t.data(),app.data(),owner?.data(),license.data());
   let hostnameEvidence:{hostname?:string;reason:string}={reason:"HOSTNAME_PREREQUISITES_REQUIRED"};
   const needed=["tenant","product","googleBinding","firebaseResources","permissionPreflight","sdk"];
   if(needed.every(r=>preliminary.steps.some(s=>s.resource===r&&s.status==="REUSE"))){
    try{
     const hostname=canonicalHostname(id,d.appId),input={tenantId:id,appId:d.appId,hostname};
     const identity=hostnameIdentity(input,d);
     const [cfg,inst,candidates,bindings,catalog,dns]=await Promise.all([
      tx.get(db.collection("configurations").doc(hostname)),tx.get(db.collection("appInstallations").doc(hostname)),
      tx.get(db.collection("clientProvisioning").where("hostname","==",hostname).limit(3)),tx.get(db.collection("clientProvisioning").where("hostnameBinding.hostname","==",hostname).limit(3)),tx.get(db.collection("tenants").limit(501)),tx.get(db.collection("tenantDnsSlugs").doc(canonicalTenantDnsSlug(id)))]);
     const dnsIdentity=assertTenantDnsIdentity(id,t.data(),catalog.docs.map(x=>({id:x.id,data:x.data()})),dns.data());
     hostnameEvidence=inspectCanonicalHostname(identity,d.hostnameBinding,[...candidates.docs,...bindings.docs].map(x=>({id:x.id,data:x.data()})),cfg.exists||inst.exists,dnsIdentity.registered);
    }catch(e){
     const reason=e instanceof Error?e.message:"";
     hostnameEvidence={reason:["TENANT_DNS_RECONCILIATION_REQUIRED","TENANT_DNS_CONFLICT_REVIEW_REQUIRED","HOSTNAME_CONFLICT_REVIEW_REQUIRED","HOSTNAME_BINDING_IMMUTABLE","HOSTNAME_NOT_CANONICAL","HOSTNAME_APP_INVALID","HOSTNAME_INTAKE_NOT_ELIGIBLE"].includes(reason)?reason:"HOSTNAME_VALIDATION_UNAVAILABLE"};
    }
   }
   const plan=buildClientInstallationPreview(id,d,t.data(),app.data(),owner?.data(),license.data(),hostnameEvidence);
   const r=d.requirements;
   const providerInput=plan.hostname&&typeof plan.sourceCommit==="string"&&typeof r?.repository==="string"&&typeof r?.vercelProjectId==="string"&&typeof r?.deploymentId==="string"?{appId:plan.appId,repository:r.repository,vercelProjectId:r.vercelProjectId,sourceCommit:plan.sourceCommit,deploymentId:r.deploymentId,hostname:plan.hostname}:null;
   return {plan,providerInput};
  },{readOnly:true});
  const plan=result.plan;
  // Provider network reads outside Firestore transaction. No external mutations or stored attestations.
  if(result.providerInput){const evidence=await clientProviderPreflight(result.providerInput);const step=plan.steps.find(s=>s.resource==="release");if(step){step.status=evidence.status;step.reason=evidence.reason;step.evidence=evidence.checkedAt;}
   return ok({...plan,providerEvidence:evidence});}
  return ok(plan);
 }catch(e){return fail(e)}
}
