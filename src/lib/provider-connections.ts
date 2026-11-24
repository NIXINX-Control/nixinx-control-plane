import "server-only";
import {adminApp} from "@/lib/server";
import {envNames,secretIds,validProject,validTeam,validToken,probeUrl,probeResult,type ProviderId} from "@/lib/provider-connections-policy";
export class ProviderConnectionError extends Error{}
const team=()=>process.env.NIXINX_PROVISIONING_VERCEL_TEAM_ID||"";
// Opt-in to a single Control-owned vault. No fallback to an env token after opting in.
export function custodyProject(){
 const project=process.env.NIXINX_PROVISIONING_SECRET_PROJECT_ID;
 if(!project)return null;
 if(!validProject(project)||project!==process.env.FIREBASE_PROJECT_ID)throw new ProviderConnectionError("CONTROL_VAULT_PROJECT_MISMATCH");
 return project;
}
export function providerTeam(){const t=team();if(!validTeam(t))throw new ProviderConnectionError("VERCEL_TEAM_NOT_CONFIGURED");return t}
async function secretRequest(id:ProviderId,operation:"access"|"addVersion",token?:string){
 const project=custodyProject();
 if(!project)throw new ProviderConnectionError("CONTROL_VAULT_NOT_CONFIGURED");
 const credential=adminApp.options.credential;
 if(!credential)throw new ProviderConnectionError("CONTROL_WORKLOAD_IDENTITY_UNAVAILABLE");
 let google:string;
 try{google=(await credential.getAccessToken()).access_token}catch{throw new ProviderConnectionError("CONTROL_WORKLOAD_IDENTITY_UNAVAILABLE")}
 const base="https://secretmanager.googleapis.com/v1/projects/"+project+"/secrets/"+secretIds[id];
 const res=await fetch(base+(operation==="access"?"/versions/latest:access":":addVersion"),{method:operation==="access"?"GET":"POST",headers:{Authorization:"Bearer "+google,"Content-Type":"application/json"},...(operation==="addVersion"?{body:JSON.stringify({payload:{data:Buffer.from(token!,"utf8").toString("base64")}})}:{}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
 if(!res.ok)throw new ProviderConnectionError(res.status===403?"VAULT_ACCESS_DENIED":res.status===404?"VAULT_SECRET_OR_VERSION_MISSING":"VAULT_REQUEST_FAILED");
 return res.json();
}
export async function getProviderToken(id:ProviderId){
 let token:string|undefined;
 if(custodyProject()){
  const r=await secretRequest(id,"access");
  if(typeof r?.payload?.data!=="string"||r.payload.data.length>10000)throw new ProviderConnectionError("VAULT_TOKEN_INVALID");
  token=Buffer.from(r.payload.data,"base64").toString("utf8");
 }else token=process.env[envNames[id]];
 if(!validToken(token))throw new ProviderConnectionError("PROVIDER_CREDENTIAL_NOT_CONFIGURED");
 return token;
}
export async function probeProvider(id:ProviderId,token:string){
 const t=id==="vercel"?providerTeam():"";
 try{
  const r=await fetch(probeUrl(id,t),{headers:{Authorization:"Bearer "+token,Accept:id==="github"?"application/vnd.github+json":"application/json"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(7000)});
  const body=r.status===200?await r.json():null;
  return probeResult(id,r.status,body,t);
 }catch{return "UNVERIFIED" as const}
}
export async function connectionStatus(id:ProviderId){
 let custody:"ENV_BOOTSTRAP"|"SECRET_MANAGER"|"INVALID"="INVALID";
 try{
  custody=custodyProject()?"SECRET_MANAGER":"ENV_BOOTSTRAP";
  const token=await getProviderToken(id);
  const status=await probeProvider(id,token);
  return {provider:id,custody,status,operationPermissionsVerified:false};
 }catch(e){return {provider:id,custody,status:e instanceof ProviderConnectionError?e.message:"UNVERIFIED",operationPermissionsVerified:false}}
}
export async function saveProviderToken(id:ProviderId,token:string){
 if(!custodyProject())throw new ProviderConnectionError("CONTROL_VAULT_NOT_CONFIGURED");
 if(await probeProvider(id,token)!=="IDENTITY_VERIFIED")throw new ProviderConnectionError("PROVIDER_IDENTITY_NOT_VERIFIED");
 // Pre-created, fixed secret names only; no arbitrary project, secret ID, URL, or IAM change from the UI.
 try{
  if(await getProviderToken(id)===token)return {provider:id,status:"IDENTITY_VERIFIED",custody:"SECRET_MANAGER",operationPermissionsVerified:false,changed:false};
 }catch(e){if(!(e instanceof ProviderConnectionError)||!["VAULT_SECRET_OR_VERSION_MISSING","VAULT_TOKEN_INVALID","PROVIDER_CREDENTIAL_NOT_CONFIGURED"].includes(e.message))throw e}
 const r=await secretRequest(id,"addVersion",token);
 if(typeof r?.name!=="string"||!new RegExp("^projects/[a-zA-Z0-9-]+/secrets/"+secretIds[id]+"/versions/[1-9][0-9]*$").test(r.name))throw new ProviderConnectionError("VAULT_VERSION_WRITE_UNVERIFIED");
 const actual=await getProviderToken(id);
 if(actual!==token)throw new ProviderConnectionError("VAULT_READBACK_MISMATCH");
 return {provider:id,status:"IDENTITY_VERIFIED",custody:"SECRET_MANAGER",operationPermissionsVerified:false,changed:true};
}
