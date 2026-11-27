import {NextRequest} from "next/server";
import {staffIdentity,ok,fail,ApiError} from "@/lib/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 try{
  if(process.env.VERCEL_ENV!=="production"||process.env.FIREBASE_PROJECT_ID!=="nixinx-control"||req.nextUrl.origin!=="https://controlde.nixinx.org")throw new ApiError(503,"SUPPORT_UNAVAILABLE");
  await staffIdentity(req);
  const raw=await req.text();if(raw.length>10000)throw new ApiError(413,"REQUEST_TOO_LARGE");
  const body=JSON.parse(raw);if(!body||typeof body!=="object"||!["list","detail","update"].includes(body.operation))throw new ApiError(400,"INVALID_REQUEST");
  const r=await fetch("https://nixinx.com/api/customer-portal/staff-support",{method:"POST",headers:{Authorization:req.headers.get("authorization")||"","Content-Type":"application/json"},body:raw,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(r.status===404&&body.operation==="list")throw new ApiError(503,"SUPPORT_UNAVAILABLE");
  const v=await r.json();if(!r.ok){const codes=["STAFF_REQUIRED","SUPPORT_UNAVAILABLE","SUPPORT_STALE","SUPPORT_TRANSITION_INVALID","SUPPORT_REPLY_INVALID","SUPPORT_HISTORY_LIMIT","SUPPORT_NOT_FOUND","INVALID_FILTER","INVALID_REQUEST","REQUEST_TOO_LARGE"];throw new ApiError(r.status,codes.includes(v.error)?v.error:"SUPPORT_UNAVAILABLE");}
  return ok(v);
 }catch(e){return fail(e);}
}
