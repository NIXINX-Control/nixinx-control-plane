import {NextRequest} from "next/server";
import {staffIdentity,ok,fail,ApiError} from "@/lib/server";
import {parseProductDiscoveryInput} from "@/lib/product-discovery";
import {discoverProduct,DiscoveryUnavailable} from "@/lib/product-discovery-provider";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 try{
  const staff=await staffIdentity(req);
  if(staff.role!=="superadmin")throw new ApiError(403,"Superadministrator required");
  let input;
  try{input=parseProductDiscoveryInput(await req.json())}catch{throw new ApiError(400,"Invalid product discovery input")}
  try{return ok(await discoverProduct(input))}catch(e){
   if(e instanceof DiscoveryUnavailable)throw new ApiError(503,"Product provider discovery unavailable");
   throw new ApiError(409,"Product binding or requirements could not be verified");
  }
 }catch(e){return fail(e)}
}
