import "server-only";
import {parseProductDiscoveryInput,reconcileProduct,type ProductDiscoveryInput} from "@/lib/product-discovery";
export class DiscoveryUnavailable extends Error {}
async function readJson(url:string,token:string,accept:string){
 const res=await fetch(url,{method:"GET",headers:{Authorization:"Bearer "+token,Accept:accept},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(7000)});
 if(!res.ok)throw new DiscoveryUnavailable("PROVIDER_READ_FAILED");
 return res.json();
}
export async function discoverProduct(input:ProductDiscoveryInput){
 // Provider authorization must be provisioned separately by NIXINX; never accept
 // credentials or arbitrary URLs from a caller, or fall back to another team.
 input=parseProductDiscoveryInput(input);
 const github=process.env.NIXINX_PROVISIONING_GITHUB_READ_TOKEN;
 const vercel=process.env.NIXINX_PROVISIONING_VERCEL_READ_TOKEN;
 const team=process.env.NIXINX_PROVISIONING_VERCEL_TEAM_ID;
 if(!github||!vercel||!team||!/^team_[A-Za-z0-9]{8,80}$/.test(team))throw new DiscoveryUnavailable("PROVIDER_CREDENTIALS_NOT_CONFIGURED");
 const base="https://api.github.com/repos/"+input.repository;
 const accept="application/vnd.github+json";
 const [repository,branch,project]=await Promise.all([
  readJson(base,github,accept),
  readJson(base+"/branches/main",github,accept),
  readJson("https://api.vercel.com/v9/projects/"+input.vercelProjectId+"?teamId="+encodeURIComponent(team),vercel,"application/json")
 ]);
 const commit=branch?.commit?.sha;
 if(typeof commit!=="string"||! /^[a-f0-9]{40}$/.test(commit))throw new DiscoveryUnavailable("REPOSITORY_HEAD_UNVERIFIED");
 const f=await readJson(base+"/contents/nixinx.manifest.json?ref="+commit,github,accept);
 if(f?.type!=="file"||f.path!=="nixinx.manifest.json"||f.encoding!=="base64"||typeof f.size!=="number"||f.size>64000||typeof f.content!=="string"||f.content.length>100000)throw new DiscoveryUnavailable("MANIFEST_UNAVAILABLE_OR_TOO_LARGE");
 let manifest:unknown;
 try{manifest=JSON.parse(Buffer.from(f.content,"base64").toString("utf8"))}catch{throw new DiscoveryUnavailable("INVALID_MANIFEST_JSON")}
 const discovery=reconcileProduct(input,{repository,branch,manifest,project,teamId:team});
 // Only accept the current production target, not a Preview or a successful build on another SHA.
 let release:{deploymentId:string;sourceCommit:string}|null=null;
 const deploymentId=project?.targets?.production?.id;
 if(typeof deploymentId==="string"&&/^dpl_[A-Za-z0-9]{8,80}$/.test(deploymentId)){
  const d=await readJson("https://api.vercel.com/v13/deployments/"+deploymentId+"?teamId="+encodeURIComponent(team),vercel,"application/json");
  const gitSha=d?.gitSource?.sha??d?.meta?.githubCommitSha;
  if(d?.id===deploymentId&&d?.projectId===input.vercelProjectId&&d?.target==="production"&&d?.readyState==="READY"&&gitSha===commit)release={deploymentId,sourceCommit:commit};
 }
 return {...discovery,release};
}
