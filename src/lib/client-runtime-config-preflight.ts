import "server-only";
import {createHash} from "node:crypto";
import {restoreClientGoogleBinding} from "@/lib/client-google-binding";
import {acquireDelegatedGoogleToken} from "@/lib/client-google-delegation";
import {probeProjectPermissions} from "@/lib/google-permission-preflight";
import {readFirebaseSdkConfig,sdkKeys,validateSdkRequirements} from "@/lib/firebase-sdk-config";
import {parseConfiguration} from "@/lib/tenant-configuration";
import {canonicalHostname,canonicalTenantDnsSlug} from "@/lib/client-hostname-draft";
type ConfigInput = {tenantId:string;appId:string;hostname:string;binding:unknown;requirements:unknown};
export async function readRuntimeCandidate(input:ConfigInput,oidc:string|null,environment:string|undefined){
 const checkedAt=new Date().toISOString();
 const blocked=(reason:string)=>({status:"BLOCKED" as const,reason,checkedAt});
 try{
  if(environment!=="production"||input.hostname!==canonicalHostname(input.tenantId,input.appId))return blocked("RUNTIME_CONFIG_BINDING_INVALID");
  const b=restoreClientGoogleBinding(input.binding,input.tenantId,input.appId),required=validateSdkRequirements(input.requirements);
  if(required.length!==sdkKeys.length)return blocked("RUNTIME_CONFIG_CONTRACT_UNSUPPORTED");
  const token=await acquireDelegatedGoogleToken(b,oidc,environment);
  const fresh=await probeProjectPermissions(b.projectNumber,token);
  if(fresh.status!=="PROJECT_PERMISSION_PREFLIGHT_PASS"||fresh.sdkConfigPermission!==true)return blocked("RUNTIME_CONFIG_PERMISSION_REVIEW");
  const {values}=await readFirebaseSdkConfig(b,required,token);
  // Validate the existing public SDK shape using the DNS slug, then preserve exact legacy tenant identity.
  const checked=parseConfiguration({tenantId:canonicalTenantDnsSlug(input.tenantId),appId:input.appId,hostname:input.hostname,firebase:values});
  if(checked.firebase.projectId!==b.projectId||checked.firebase.appId!==b.webAppId||checked.firebase.messagingSenderId!==b.projectNumber)return blocked("RUNTIME_CONFIG_BINDING_INVALID");
  const candidate={tenantId:input.tenantId,appId:input.appId,hostname:input.hostname,firebase:checked.firebase};
  const digest=createHash("sha256").update(JSON.stringify(candidate)).digest("hex");
  return {candidate,status:"VERIFY" as const,reason:"RUNTIME_CONFIG_CANDIDATE_VALIDATED_PENDING_APPLY",checkedAt,configDigest:digest,fields:required,valuesPersisted:false,valuesReturned:false,configurationWritten:false};
 }catch(e){const m=e instanceof Error?e.message:"";return blocked(/^(GOOGLE|FIREBASE|FIRESTORE|VERCEL)_[A-Z0-9_]{1,100}$/.test(m)?m:"RUNTIME_CONFIG_PREFLIGHT_UNVERIFIED")}
}

export async function runtimeConfigPreflight(input:ConfigInput,oidc:string|null,environment:string|undefined){
 const result=await readRuntimeCandidate(input,oidc,environment);
 if(result.status==="BLOCKED")return result;
 const {candidate: _candidate,...evidence}=result;
 return evidence;
}
