import {NextRequest} from "next/server";
import {staffIdentity,ok,fail,ApiError} from "@/lib/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 try{const staff=await staffIdentity(req);if(!staff.canEditPrice)throw new ApiError(403,"Financial authority required");return ok({authorized:true});}catch(e){return fail(e);}
}
