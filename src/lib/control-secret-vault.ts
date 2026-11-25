import "server-only";
import {adminApp} from "@/lib/server";
import {validProject} from "@/lib/provider-connections-policy";
import {githubRootSecret} from "@/lib/github-app-policy";
import {vercelRootSecret} from "@/lib/vercel-integration-policy";
type RootSecret=typeof githubRootSecret|typeof vercelRootSecret;
export class ProviderConnectionError extends Error{}
export function custodyProject(){
 const project=process.env.NIXINX_PROVISIONING_SECRET_PROJECT_ID;
 if(!project)return null;
 if(!validProject(project)||project!==process.env.FIREBASE_PROJECT_ID)throw new ProviderConnectionError("CONTROL_VAULT_PROJECT_MISMATCH");
 return project;
}
async function request(secret:RootSecret,operation:"access"|"addVersion",value?:string){
 const project=custodyProject();
 if(!project)throw new ProviderConnectionError("CONTROL_VAULT_NOT_CONFIGURED");
 const credential=adminApp.options.credential;
 if(!credential)throw new ProviderConnectionError("CONTROL_WORKLOAD_IDENTITY_UNAVAILABLE");
 let google:string;
 try{google=(await credential.getAccessToken()).access_token}catch{throw new ProviderConnectionError("CONTROL_WORKLOAD_IDENTITY_UNAVAILABLE")}
 const base="https://secretmanager.googleapis.com/v1/projects/"+project+"/secrets/"+secret;
 const res=await fetch(base+(operation==="access"?"/versions/latest:access":":addVersion"),{method:operation==="access"?"GET":"POST",headers:{Authorization:"Bearer "+google,"Content-Type":"application/json"},...(operation==="addVersion"?{body:JSON.stringify({payload:{data:Buffer.from(value!,"utf8").toString("base64")}})}:{}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
 if(!res.ok)throw new ProviderConnectionError(res.status===403?"VAULT_ACCESS_DENIED":res.status===404?"VAULT_SECRET_OR_VERSION_MISSING":"VAULT_REQUEST_FAILED");
 return res.json();
}
async function readRoot(secret:RootSecret){
 const r=await request(secret,"access");
 if(typeof r?.payload?.data!=="string"||r.payload.data.length>24000)throw new ProviderConnectionError("VAULT_ROOT_INVALID");
 return Buffer.from(r.payload.data,"base64").toString("utf8");
}
async function writeRoot(secret:RootSecret,value:string){
 const r=await request(secret,"addVersion",value);
 if(typeof r?.name!=="string"||!new RegExp("^projects/[a-zA-Z0-9-]+/secrets/"+secret+"/versions/[1-9][0-9]*$").test(r.name))throw new ProviderConnectionError("VAULT_VERSION_WRITE_UNVERIFIED");
 if(await readRoot(secret)!==value)throw new ProviderConnectionError("VAULT_READBACK_MISMATCH");
}

export const readGithubRoot=()=>readRoot(githubRootSecret);
export const writeGithubRoot=(value:string)=>writeRoot(githubRootSecret,value);
export const readVercelRoot=()=>readRoot(vercelRootSecret);
export const writeVercelRoot=(value:string)=>writeRoot(vercelRootSecret,value);
