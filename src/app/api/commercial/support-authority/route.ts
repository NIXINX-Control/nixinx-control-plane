import {NextRequest} from "next/server";
import {staffIdentity,ok,fail,ApiError} from "@/lib/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 try{
  if(process.env.VERCEL_ENV!=="production"||process.env.FIREBASE_PROJECT_ID!=="nixinx-control"||req.nextUrl.origin!=="https://controlde.nixinx.org")throw new ApiError(403,"STAFF_REQUIRED");
  const staff=await staffIdentity(req);
  return ok({authorized:true,uid:staff.uid,role:staff.role});
 }catch(e){return fail(e);}
}
