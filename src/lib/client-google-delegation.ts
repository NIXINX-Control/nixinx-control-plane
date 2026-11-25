import "server-only";
import {exchangeGoogleFederation,FederationError} from "./google-federation";
import {providerFor,serviceAccountFor,type ClientGoogleBinding} from "./client-google-binding";
import {discoverGoogleProject} from "./google-discovery";
export async function acquireDelegatedGoogleToken(b:ClientGoogleBinding,oidc:string|null,environment:string|undefined,request:typeof fetch=fetch){
 return impersonate(b,oidc,environment,serviceAccountFor(b),request);
}

export function acquireInstallationVerifier(b:ClientGoogleBinding,oidc:string|null,environment:string|undefined){
 return impersonate(b,oidc,environment,`nixinx-installation-verifier@${b.projectId}.iam.gserviceaccount.com`,fetch);
}

async function impersonate(b:ClientGoogleBinding,oidc:string|null,environment:string|undefined,account:string,request:typeof fetch){
 const sts=await exchangeGoogleFederation(oidc,environment,request,providerFor(b));
 let response;
 try{response=await request("https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/"+encodeURIComponent(account)+":generateAccessToken",{method:"POST",headers:{Authorization:"Bearer "+sts.accessToken,"Content-Type":"application/json"},body:JSON.stringify({scope:["https://www.googleapis.com/auth/cloud-platform"],lifetime:"600s"}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)})}catch{throw new FederationError("GOOGLE_IMPERSONATION_UNAVAILABLE")}
 if(!response.ok)throw new FederationError(response.status===403?"GOOGLE_IMPERSONATION_ACCESS_DENIED":response.status===404?"GOOGLE_IMPERSONATION_NOT_FOUND":"GOOGLE_IMPERSONATION_FAILED");
 let data;try{data=await response.json()}catch{throw new FederationError("GOOGLE_IMPERSONATION_RESPONSE_INVALID")}
 const expiry=Date.parse(data?.expireTime),now=Date.now();
 if(typeof data?.accessToken!=="string"||!data.accessToken||!Number.isFinite(expiry)||expiry<=now||expiry>now+660000)throw new FederationError("GOOGLE_IMPERSONATION_RESPONSE_INVALID");
 return data.accessToken as string;
}

export async function discoverDelegatedClient(b:ClientGoogleBinding,oidc:string|null,environment:string|undefined,request:typeof fetch=fetch){
 return discoverGoogleProject(b,await acquireDelegatedGoogleToken(b,oidc,environment,request),request);
}
