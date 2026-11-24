import {NextRequest} from "next/server";
import {staffIdentity,db,ok,fail,ApiError} from "@/lib/server";
import {parseProductDiscoveryInput} from "@/lib/product-discovery";
import {discoverProduct,DiscoveryUnavailable} from "@/lib/product-discovery-provider";
import {prepareProductRegistration} from "@/lib/product-registration-plan";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 try{
  const staff=await staffIdentity(req);
  if(staff.role!=="superadmin")throw new ApiError(403,"Superadministrator required");
  let input;
  try{input=parseProductDiscoveryInput(await req.json())}catch{throw new ApiError(400,"Invalid product discovery input")}
  let discovery;
  try{discovery=await discoverProduct(input)}catch(e){
   if(e instanceof DiscoveryUnavailable)throw new ApiError(503,"Product provider discovery unavailable");
   throw new ApiError(409,"Product binding or requirements could not be verified");
  }
  const registration=await db.runTransaction(async tx=>{
   const [apps,modules]=await Promise.all([tx.get(db.collection("apps").limit(501)),tx.get(db.collection("appModules").limit(501))]);
   if(apps.size>500||modules.size>500)throw new ApiError(409,"Catalog exceeds safe plan precheck limit");
   return prepareProductRegistration(discovery,{apps:apps.docs.map(x=>({id:x.id,data:x.data()})),modules:modules.docs.map(x=>({id:x.id,data:x.data()}))},discovery.release);
  },{readOnly:true});
  const {mutation,...review}=registration;
  return ok({...discovery,registration:review});
 }catch(e){return fail(e)}
}
