import "server-only";
import {headers} from "next/headers";
import type {Credential} from "firebase-admin/app";

/**
 * Keyless Vercel Preview -> Google Cloud federation.
 * No service-account JSON, long-lived keys, or browser secrets.
 * Fail closed for non-preview workloads or missing signed Vercel tokens.
 */
export function vercelPreviewGoogleCredential():Credential {
 const projectId=process.env.FIREBASE_PROJECT_ID;
 const provider=process.env.NIXINX_CONTROL_WIF_PROVIDER;
 const email=process.env.NIXINX_CONTROL_WIF_SERVICE_ACCOUNT;
 if(!projectId||!/^nixinx-control-sbx-[a-z0-9-]+$/.test(projectId)||
    !provider||!/^\/\/iam\.googleapis\.com\/projects\/[0-9]+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/.test(provider)||
    !email||!email.endsWith("@"+projectId+".iam.gserviceaccount.com")){
  throw new Error("Keyless Control Preview identity is not configured");
 }
 return {
  async getAccessToken(){
   if(process.env.VERCEL_ENV!=="preview")throw new Error("Keyless credential restricted to Preview");
   const token=(await headers()).get("x-vercel-oidc-token");
   if(!token)throw new Error("Signed Vercel OIDC identity unavailable");
   const exchange=await fetch("https://sts.googleapis.com/v1/token",{
    method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
     audience:provider,
     grant_type:"urn:ietf:params:oauth:grant-type:token-exchange",
     requested_token_type:"urn:ietf:params:oauth:token-type:access_token",
     scope:"https://www.googleapis.com/auth/cloud-platform",
     subject_token_type:"urn:ietf:params:oauth:token-type:jwt",
     subject_token:token
    })
   });
   if(!exchange.ok)throw new Error("Google Workload Identity token exchange denied");
   const sts=await exchange.json() as {access_token?:string};
   if(!sts.access_token)throw new Error("Google identity token missing");
   const result=await fetch("https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/"+encodeURIComponent(email)+":generateAccessToken",{
    method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+sts.access_token},
    body:JSON.stringify({scope:["https://www.googleapis.com/auth/cloud-platform"],lifetime:"3600s"})
   });
   if(!result.ok)throw new Error("Firebase service identity impersonation denied");
   const credentials=await result.json() as {accessToken?:string;expireTime?:string};
   if(!credentials.accessToken||!credentials.expireTime)throw new Error("Google access token missing");
   const seconds=Math.floor((Date.parse(credentials.expireTime)-Date.now())/1000);
   if(!Number.isFinite(seconds)||seconds<=60)throw new Error("Google access token already expired");
   return {access_token:credentials.accessToken,expires_in:Math.max(1,seconds-30)};
  }
 };
}
