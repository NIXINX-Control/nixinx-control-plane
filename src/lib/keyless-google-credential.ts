import "server-only";
import {writeFileSync,renameSync,existsSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";
import type {NextRequest} from "next/server";

const dir=tmpdir();
const configurationFile=join(dir,"nixinx-control-oidc-credential-"+process.pid+".json");
const oidcTokenFile=join(dir,"nixinx-control-oidc-token-"+process.pid+".txt");

/**
 * Configure Google Application Default Credentials (ADC) using Google-supported
 * external_account identity federation. Firebase Admin's Cloud Firestore client
 * explicitly requires ADC or a key; arbitrary Credential implementations fail.
 *
 * The JSON config contains NO secrets or private keys. A short-lived, signed
 * OIDC token, obtained from the Vercel runtime on each incoming request, is
 * supplied to GoogleAuth via a restricted /tmp file.
 */
export function configureKeylessControlADC():void{
 const projectId=process.env.FIREBASE_PROJECT_ID;
 const provider=process.env.NIXINX_CONTROL_WIF_PROVIDER;
 const email=process.env.NIXINX_CONTROL_WIF_SERVICE_ACCOUNT;
 if(process.env.VERCEL_ENV!=="preview"||
   projectId!=="nixinx-control-sbx-26"||
   !provider||!/^\/\/iam\.googleapis\.com\/projects\/1080730147334\/locations\/global\/workloadIdentityPools\/vercel-control\/providers\/nixinx-projects$/.test(provider)||
   email!=="firebase-adminsdk-fbsvc@nixinx-control-sbx-26.iam.gserviceaccount.com")
  throw new Error("Sandbox-only Google identity federation is not configured");
 const json={
  type:"external_account",
  audience:provider,
  subject_token_type:"urn:ietf:params:oauth:token-type:jwt",
  token_url:"https://sts.googleapis.com/v1/token",
  service_account_impersonation_url:"https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/"+email+":generateAccessToken",
  credential_source:{file:oidcTokenFile,format:{type:"text"}}
 };
 if(!existsSync(configurationFile))
  writeFileSync(configurationFile,JSON.stringify(json),{mode:0o600});
 process.env.GOOGLE_APPLICATION_CREDENTIALS=configurationFile;
 process.env.GOOGLE_CLOUD_PROJECT=projectId;
}

/** Call this in EVERY authenticated server route before making Firebase Admin calls. */
export function supplyVercelOidcForRequest(req:NextRequest):void{
 if(!process.env.NIXINX_CONTROL_WIF_PROVIDER)return;
 if(process.env.VERCEL_ENV!=="preview")throw new Error("OIDC is not available outside Preview");
 // The Vercel platform injects the signed header into function requests.
 const token=req.headers.get("x-vercel-oidc-token");
 if(!token||token.split(".").length!==3||token.length>12000)
  throw new Error("Signed Vercel runtime identity unavailable");
 const temporary=oidcTokenFile+"."+randomUUID();
 writeFileSync(temporary,token,{mode:0o600});
 renameSync(temporary,oidcTokenFile);
}
