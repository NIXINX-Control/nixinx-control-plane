import {NextRequest} from "next/server";
import {superadminUser,db,ok,fail,ApiError} from "@/lib/server";
import {parseHostnameApproval,hostnameIdentity,decideHostnameDraft,matchesHostnameDraft,canonicalTenantDnsSlug,assertTenantDnsIdentity} from "@/lib/client-hostname-draft";
import {buildClientInstallationPreview} from "@/lib/client-installation-preview";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 try{
  const actor=await superadminUser(req);
  if(process.env.VERCEL_ENV!=="production")throw new ApiError(409,"HOSTNAME_PRODUCTION_ONLY");
  const raw=await req.text();if(raw.length>2048)throw new ApiError(400,"HOSTNAME_APPROVAL_INVALID");
  let input;try{input=parseHostnameApproval(JSON.parse(raw))}catch(e){throw new ApiError(400,e instanceof Error&&["HOSTNAME_NOT_CANONICAL","TENANT_DNS_RECONCILIATION_REQUIRED"].includes(e.message)?e.message:"HOSTNAME_APPROVAL_INVALID")}
  const slug=canonicalTenantDnsSlug(input.tenantId),dnsRef=db.collection("tenantDnsSlugs").doc(slug);
  const ref=db.collection("clientProvisioning").doc(input.tenantId),at=new Date().toISOString();
  const result=await db.runTransaction(async tx=>{
   const [draft,tenant,app,config,install,otherCandidates,otherBindings,catalog,dns]= await Promise.all([
    tx.get(ref),tx.get(db.collection("tenants").doc(input.tenantId)),tx.get(db.collection("apps").doc(input.appId)),
    tx.get(db.collection("configurations").doc(input.hostname)),tx.get(db.collection("appInstallations").doc(input.hostname)),
    tx.get(db.collection("clientProvisioning").where("hostname","==",input.hostname).limit(3)),
    tx.get(db.collection("clientProvisioning").where("hostnameBinding.hostname","==",input.hostname).limit(3)),
    tx.get(db.collection("tenants").limit(501)),tx.get(dnsRef)
   ]);
   let dnsIdentity;try{dnsIdentity=assertTenantDnsIdentity(input.tenantId,tenant.data(),catalog.docs.map(x=>({id:x.id,data:x.data()})),dns.data())}catch(e){throw new ApiError(409,(e as Error).message)}
   const d=draft.data();if(!d)throw new ApiError(409,"HOSTNAME_INTAKE_NOT_ELIGIBLE");
   let identity;try{identity=hostnameIdentity(input,d)}catch{throw new ApiError(409,"HOSTNAME_INTAKE_NOT_ELIGIBLE")}
   const owner=await tx.get(db.collection("firebaseProjectOwners").doc(identity.projectId));
   let plan;try{plan=buildClientInstallationPreview(input.tenantId,d,tenant.data(),app.data(),owner.data(),undefined)}catch{throw new ApiError(409,"HOSTNAME_INTAKE_NOT_ELIGIBLE")}
   const needed=["tenant","product","googleBinding","firebaseResources","permissionPreflight","sdk"];
   if(!needed.every(r=>plan.steps.some(s=>s.resource===r&&s.status==="REUSE")))throw new ApiError(409,"HOSTNAME_PREREQUISITES_REQUIRED");
   let action;try{action=decideHostnameDraft(identity,d.hostnameBinding,[...otherCandidates.docs,...otherBindings.docs].map(x=>({id:x.id,data:x.data()})),config.exists||install.exists)}catch(e){throw new ApiError(409,(e as Error).message)}
   if(action==="REUSE"&&dnsIdentity.registered)return {identity,status:"ALREADY_CONFIRMED",writes:0};
   if(!dnsIdentity.registered){tx.create(dnsRef,{tenantId:input.tenantId,dnsSlug:slug,createdAt:at,createdBy:actor});tx.update(tenant.ref,{dnsSlug:slug});}
   if(action==="REUSE"){tx.create(db.collection("audit").doc(),{actor,action:"REGISTER_CANONICAL_TENANT_DNS",target:input.tenantId,appId:input.appId,hostname:input.hostname,at});return {identity,status:"HOSTNAME_DNS_RECONCILED",writes:3};}
   tx.update(ref,{hostnameBinding:{...identity,status:"PRELIMINARY_CONFIRMED",confirmedAt:at,confirmedBy:actor}});
   tx.create(db.collection("audit").doc(),{actor,action:"CONFIRM_PRELIMINARY_HOSTNAME",target:input.tenantId,appId:input.appId,hostname:input.hostname,at});
   return {identity,status:"HOSTNAME_CONFIRMED",writes:dnsIdentity.registered?2:4};
  });
  const [actualDoc,actualTenant,actualDns]=await Promise.all([ref.get(),db.collection("tenants").doc(input.tenantId).get(),dnsRef.get()]);
  const actual=actualDoc.data()?.hostnameBinding;
  if(actualTenant.data()?.dnsSlug!==slug||actualDns.data()?.tenantId!==input.tenantId||actualDns.data()?.dnsSlug!==slug||!matchesHostnameDraft(actual,result.identity))throw new ApiError(409,"HOSTNAME_READBACK_FAILED");
  return ok({status:result.status,hostname:actual.hostname,confirmedAt:actual.confirmedAt,writes:result.writes,applyAuthorized:false,technicalReady:false,commercialAuthorized:false});
 }catch(e){return fail(e)}
}
