import "server-only";
// Corporate production trust binding verified by operator in P03-02H.
// No per-tenant credentials, browser token input, ADC changes or persistent token cache.
export const googleFederationBinding=Object.freeze({
 issuer:"https://oidc.vercel.com/nixinx-projects",
 audience:"https://vercel.com/nixinx-projects",
 subject:"owner:nixinx-projects:project:nixinx-control:environment:production",
 ownerId:"team_7GCW65202sW0sdYEgH3LDeFE",
 projectId:"prj_fmMemrnCsZekWDFbEDmncW6nJtZK",
 provider:"//iam.googleapis.com/projects/426004498210/locations/global/workloadIdentityPools/nixinx-control-prod/providers/vercel-control-prod"
});
export class FederationError extends Error{}
export function assertProductionOidc(token:string|null,environment:string|undefined,now=Date.now()){
 if(environment!=="production")throw new FederationError("GOOGLE_FEDERATION_PRODUCTION_ONLY");
 if(!token||token.length>12000||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/.test(token))throw new FederationError("VERCEL_OIDC_UNAVAILABLE");
 let c;
 try{c=JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString("utf8"))}catch{throw new FederationError("VERCEL_OIDC_INVALID")}
 // Decoded claims are only a preflight. Google STS validates the signature and trust policy.
 const b=googleFederationBinding,t=Math.floor(now/1000);
 if(!c||c.iss!==b.issuer||c.aud!==b.audience||c.sub!==b.subject||c.owner_id!==b.ownerId||c.project_id!==b.projectId||c.environment!=="production")throw new FederationError("VERCEL_OIDC_BINDING_MISMATCH");
 if(!Number.isInteger(c.exp)||!Number.isInteger(c.nbf)||!Number.isInteger(c.iat)||c.exp<=t||c.nbf>t+30||c.iat>t+30||c.exp<=c.iat)throw new FederationError("VERCEL_OIDC_TIME_INVALID");
 return token;
}
export async function exchangeGoogleFederation(token:string|null,environment:string|undefined,request:typeof fetch=fetch,provider=googleFederationBinding.provider as string){
 if(provider!==googleFederationBinding.provider&&!/^\/\/iam\.googleapis\.com\/projects\/[0-9]{1,30}\/locations\/global\/workloadIdentityPools\/nixinx-control-delegation\/providers\/vercel-control-prod$/.test(provider))throw new FederationError("GOOGLE_PROVIDER_INVALID");
 const subjectToken=assertProductionOidc(token,environment);
 let res:Response;
 try{res=await request("https://sts.googleapis.com/v1/token",{
 method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000),
 body:JSON.stringify({grantType:"urn:ietf:params:oauth:grant-type:token-exchange",audience:provider,scope:"https://www.googleapis.com/auth/cloud-platform",requestedTokenType:"urn:ietf:params:oauth:token-type:access_token",subjectTokenType:"urn:ietf:params:oauth:token-type:jwt",subjectToken})
 })}catch{throw new FederationError("GOOGLE_STS_UNAVAILABLE")}
 if(!res.ok){
  let code="";try{code=(await res.json()).error}catch{}
  // Never return provider descriptions or response bodies; they can contain sensitive data.
  throw new FederationError(code==="invalid_grant"?"GOOGLE_STS_INVALID_GRANT":code==="invalid_target"?"GOOGLE_STS_INVALID_TARGET":res.status===403?"GOOGLE_STS_ACCESS_DENIED":res.status===429?"GOOGLE_STS_RATE_LIMITED":"GOOGLE_STS_EXCHANGE_FAILED");
 }
 let result;
 try{result=await res.json()}catch{throw new FederationError("GOOGLE_STS_RESPONSE_INVALID")}
 if(!result||typeof result.access_token!=="string"||!result.access_token||result.token_type?.toLowerCase?.()!=="bearer"||result.issued_token_type!=="urn:ietf:params:oauth:token-type:access_token"||!Number.isInteger(result.expires_in)||result.expires_in<=0||result.expires_in>3600)throw new FederationError("GOOGLE_STS_RESPONSE_INVALID");
 return {accessToken:result.access_token,expiresIn:result.expires_in};
}
export async function probeGoogleFederation(token:string|null,environment:string|undefined,request:typeof fetch=fetch){
 const {expiresIn}=await exchangeGoogleFederation(token,environment,request);
 return {status:"STS_EXCHANGE_VERIFIED",provider:"google",environment:"production",expiresIn,clientDelegationVerified:false,operationPermissionsVerified:false};
}
