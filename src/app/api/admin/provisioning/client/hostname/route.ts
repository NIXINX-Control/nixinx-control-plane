import {NextRequest} from "next/server";
import {superadminUser,fail,ApiError} from "@/lib/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
// Retired write path. Installation authorization is the sole future write gate.
export async function POST(req:NextRequest){
 try{
  await superadminUser(req);
  throw new ApiError(409,"HOSTNAME_CONFIRMATION_RETIRED_USE_INSTALLATION_PLAN");
 }catch(e){return fail(e)}
}
