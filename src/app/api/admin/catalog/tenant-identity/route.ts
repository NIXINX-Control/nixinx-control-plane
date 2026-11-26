import {NextRequest} from "next/server";
import {adminUser,db,ok,fail,ApiError} from "@/lib/server";
import {normalizeOrganizationAcronym} from "@/lib/catalog";
import {inspectNewTenantIdentity,newTenantId} from "@/lib/tenant-identity-precheck";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 try{
  await adminUser(req);
  const id=normalizeOrganizationAcronym(req.nextUrl.searchParams.get("id")||"");
  if(!newTenantId.test(id)||req.nextUrl.searchParams.getAll("id").length!==1||[...req.nextUrl.searchParams.keys()].some(k=>k!=="id"))throw new ApiError(400,"TENANT_ID_INVALID");
  const result=await db.runTransaction(async tx=>{
   const [tenants,drafts,registry,configs,installations]=await Promise.all([
    tx.get(db.collection("tenants").limit(501)),tx.get(db.collection("clientProvisioning").limit(501)),tx.get(db.collection("tenantDnsSlugs").doc(id)),tx.get(db.collection("configurations").limit(501)),tx.get(db.collection("appInstallations").limit(501))]);
   const rows=(s:typeof tenants)=>s.docs.map(x=>({id:x.id,data:x.data()}));
   try{return inspectNewTenantIdentity(id,rows(tenants),rows(drafts),registry.data(),rows(configs),rows(installations))}catch(e){throw new ApiError(409,(e as Error).message)}
  },{readOnly:true});
  return ok(result);
 }catch(e){return fail(e)}
}
