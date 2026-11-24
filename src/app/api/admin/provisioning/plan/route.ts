import {NextRequest} from "next/server";
import {staffIdentity,db,ok,fail,ApiError} from "@/lib/server";
import {parsePlanInput,planHostname,buildProvisioningPlan,type PlanSnapshot} from "@/lib/provisioning-plan";
export const runtime="nodejs";
export const dynamic="force-dynamic";
// POST accepts a plan request, but performs only catalog reads. No writes or provider calls.
export async function POST(req:NextRequest){
 try{
  await staffIdentity(req);
  let input;
  try{input=parsePlanInput(await req.json());}catch{throw new ApiError(400,"Invalid provisioning plan request");}
  const {appId,tenantId}=input,hostname=planHostname(input);
  // A consistent catalog snapshot: no inference from an incomplete case-insensitive scan.
  const result=await db.runTransaction(async tx=>{
   const [apps,tenants]=await Promise.all([
    tx.get(db.collection("apps").limit(501)),
    tenantId?tx.get(db.collection("tenants").limit(501)):Promise.resolve(undefined)
   ]);
   if(apps.size>500||(tenants&&tenants.size>500))throw new ApiError(409,"Catalog exceeds safe plan precheck limit");
   const s:PlanSnapshot={
    app:apps.docs.find(d=>d.id===appId)?.data(),
    appCaseConflict:apps.docs.some(d=>d.id!==appId&&d.id.toLowerCase()===appId.toLowerCase()),
    ...(tenantId?{
      tenant:tenants?.docs.find(d=>d.id===tenantId)?.data(),
      tenantCaseConflict:tenants?.docs.some(d=>d.id!==tenantId&&d.id.toLowerCase()===tenantId.toLowerCase())
    }:{})
   };
   if(tenantId){
    s.license=(await tx.get(db.collection("licenses").doc(tenantId+"_"+appId))).data();
    if(hostname){
     const [cfg,inst]=await Promise.all([
      tx.get(db.collection("configurations").doc(hostname)),
      tx.get(db.collection("appInstallations").doc(hostname))
     ]);
     s.configuration=cfg.data();s.installation=inst.data();
     const project=s.configuration?.firebase;
     const projectId=project&&typeof project==="object"&&!Array.isArray(project)?(project as Record<string,unknown>).projectId:undefined;
     if(typeof projectId==="string"&&/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId))
      s.firebaseOwner=(await tx.get(db.collection("firebaseProjectOwners").doc(projectId))).data();
    }
   }
   return buildProvisioningPlan(input,s);
  },{readOnly:true});
  return ok(result);
 }catch(e){return fail(e)}
}
