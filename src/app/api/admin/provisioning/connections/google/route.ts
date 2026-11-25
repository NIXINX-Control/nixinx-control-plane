import {NextRequest} from "next/server";
import {superadminUser,ok,fail,ApiError} from "@/lib/server";
import {probeGoogleFederation,FederationError} from "@/lib/google-federation";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 try{
  if(process.env.VERCEL_ENV!=="production")throw new ApiError(409,"GOOGLE_FEDERATION_PRODUCTION_ONLY");
  await superadminUser(req);
  // Only the platform runtime header; no request-body token or target, no env fallback.
  try{return ok(await probeGoogleFederation(req.headers.get("x-vercel-oidc-token"),process.env.VERCEL_ENV))}
  catch(e){throw new ApiError(409,e instanceof FederationError?e.message:"GOOGLE_FEDERATION_UNVERIFIED")}
 }catch(e){return fail(e)}
}
