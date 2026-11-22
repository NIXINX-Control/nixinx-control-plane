import "server-only";
import {cert,getApps,initializeApp,applicationDefault} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore,FieldValue,Timestamp} from "firebase-admin/firestore";
import {NextRequest} from "next/server";
import {resolveStaffRole, type NixinxStaffRole} from "@/lib/staff-roles";
import {configureKeylessControlADC,supplyVercelOidcForRequest} from "@/lib/keyless-google-credential";
// Firebase Auth AND Cloud Firestore must use supported ADC credentials in keyless Preview.
const useKeylessPreview=Boolean(process.env.NIXINX_CONTROL_WIF_PROVIDER);
if(useKeylessPreview)configureKeylessControlADC();
export const adminApp=getApps()[0]??initializeApp(
 useKeylessPreview?{
  projectId:process.env.FIREBASE_PROJECT_ID,
  credential:applicationDefault()
 }:process.env.FIREBASE_CLIENT_EMAIL&&process.env.FIREBASE_PRIVATE_KEY?{
  credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,"\n")})
 }:{credential:applicationDefault()}
);
export const db=getFirestore(adminApp);
export {FieldValue,Timestamp};
export class ApiError extends Error {constructor(public status:number,message:string){super(message)}}
export async function staffIdentity(req:NextRequest):Promise<{uid:string;role:NixinxStaffRole}>{
 const bearer=req.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer "))throw new ApiError(401,"Authentication required");
 if(useKeylessPreview)supplyVercelOidcForRequest(req);
 const token=await getAuth(adminApp).verifyIdToken(bearer.slice(7),true).catch((error:unknown)=>{
  const code=typeof error==="object"&&error!==null&&"code" in error?String(error.code):"UNKNOWN";
  console.warn("nixinx_staff_auth_denied",JSON.stringify({reason:"TOKEN_VERIFICATION_FAILED",code}));
  throw new ApiError(401,"Invalid session");
 });
 let role=resolveStaffRole(token.uid,process.env.NIXINX_ADMIN_UIDS,process.env.NIXINX_SUPERADMIN_UIDS);
 // Controlled bootstrap for the operator's VERIFIED Firebase UID, on the existing
 // isolated Control sandbox Preview ONLY. Never applies to Production or other accounts.
 // Remove this fallback once Preview allowlist configuration is operational.
 if(!role&&process.env.VERCEL_ENV==="preview"&&
    process.env.FIREBASE_PROJECT_ID==="nixinx-control-sbx-26"&&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID==="nixinx-control-sbx-26"&&
    token.aud==="nixinx-control-sbx-26"&&
    token.uid==="raJse7LzdpboCEXWXM7SwzqnfJ82"){
  role="superadmin";
 }
 if(!role){
  console.warn("nixinx_staff_auth_denied",JSON.stringify({reason:"UID_NOT_ALLOWLISTED",preview:process.env.VERCEL_ENV==="preview",sandbox:process.env.FIREBASE_PROJECT_ID==="nixinx-control-sbx-26"}));
  throw new ApiError(403,"NIXINX administrator required");
 }
 return {uid:token.uid,role};
}
export async function adminUser(req:NextRequest){return (await staffIdentity(req)).uid}
export async function superadminUser(req:NextRequest){
 const staff=await staffIdentity(req);
 if(staff.role!=="superadmin")throw new ApiError(403,"NIXINX superadministrator required");
 return staff.uid;
}
export function ok(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}})}
export function fail(error:unknown){const e=error as Error;return Response.json({error:e instanceof ApiError?e.message:"Server error"},{status:e instanceof ApiError?e.status:500,headers:{"Cache-Control":"private, no-store"}})}
export function identifier(value:unknown){if(typeof value!=="string"||! /^[a-zA-Z0-9_-]{2,80}$/.test(value))throw new ApiError(400,"Invalid identifier");return value}
export function str(value:unknown,max=120){if(typeof value!=="string"||!value.trim()||value.length>max)throw new ApiError(400,"Invalid text");return value.trim()}
