import {NextRequest} from "next/server";
import {getApps,initializeApp} from "firebase-admin/app";
import {getFirestore,Timestamp,FieldValue} from "firebase-admin/firestore";
import {adminApp,db} from "@/lib/server";
import {accessDecision,suspensionEffective,tenantTimeZone,type License} from "@/lib/lifecycle";
import {installationAuthorized,parseServiceRequest,supportReference,verifyServiceToken} from "@/lib/service-entitlement";

export async function handleProductionEntitlement(req:NextRequest){
 const referenceCode=supportReference();
 const reply=(allowed:boolean,status=200)=>Response.json({allowed,referenceCode},{
  status,headers:{"Cache-Control":"no-store"}
 });
 if(process.env.VERCEL_ENV!=="production")return reply(false,503);
 if(!verifyServiceToken(req.headers.get("authorization"),process.env.NIXINX_CONTROL_CORPORATE_PRODUCTION_TOKEN))
  return reply(false,401);
 if(req.headers.get("content-type")?.split(";")[0].trim()!=="application/json")return reply(false,415);
 let request;
 try{request=parseServiceRequest(await req.json());}catch{return reply(false,400);}
 const projectId=process.env.NIXINX_CONTROL_CORPORATE_FIREBASE_PROJECT_ID;
 const orgId=process.env.NIXINX_CONTROL_CORPORATE_ORG_ID;
 if(!projectId||!orgId||! /^[a-zA-Z0-9_-]{2,80}$/.test(orgId)||projectId.startsWith("nixinx-"))
  return reply(false,503);
 if(request.environment!=="production"||request.moduleId||request.siteId||
   request.tenantId!==process.env.NIXINX_CONTROL_CORPORATE_PRODUCTION_TENANT_ID||
   request.hostname!==process.env.NIXINX_CONTROL_CORPORATE_PRODUCTION_HOSTNAME)
  return reply(false,403);
 let stage="control_firestore_read";
 try{
  const [installation,tenant,app,license]=await db.getAll(
   db.collection("appInstallations").doc(request.hostname),
   db.collection("tenants").doc(request.tenantId),
   db.collection("apps").doc(request.appId),
   db.collection("licenses").doc(request.tenantId+"_"+request.appId)
  );
  const binding=installation.data();
  if(binding?.tenantId!==request.tenantId||binding?.hostname!==request.hostname||
     binding?.appId!==request.appId||binding?.environment!=="production"||
     binding?.firebaseProjectId!==projectId||binding?.orgId!==orgId)
   return reply(false,403);
  const now=new Date();
  const record=license.data();
  const cutoff=Math.min(...[tenant.data()?.servicesSuspensionAt,record?.suspensionAt]
   .filter((value):value is string=>typeof value==="string").map(value=>Date.parse(value)).filter(Number.isFinite));
  const allowed=installationAuthorized(request,binding,tenant.data(),app.data())&&
   !tenant.data()?.servicesTerminatedAt&&!suspensionEffective(tenant.data()?.servicesSuspensionAt,now)&&
   record?.appId===request.appId&&record?.tenantId===request.tenantId&&
   ["active","trial","grace"].includes(record.status)&&accessDecision(record as License,now,undefined,tenantTimeZone(tenant.data()?.timeZone)).allowed;
  stage="customer_credential";
  const credential=adminApp.options.credential;
  if(!credential)return reply(false,503);
  stage="customer_firebase_init";
  const name="corporate-production-"+projectId;
  const customerApp=getApps().find(app=>app.name===name)??initializeApp({credential,projectId},name);
  stage="customer_firestore_write";
  await getFirestore(customerApp).doc("organizations/"+orgId+"/nixinxControl/access").set({
   active:allowed,appId:request.appId,environment:"production",
   expiresAt:Timestamp.fromMillis(allowed?Math.min(now.getTime()+30_000,cutoff):now.getTime()),
   updatedAt:FieldValue.serverTimestamp()
  });
  return reply(allowed);
 }catch(error){
  const rawCode=typeof error==="object"&&error!==null&&"code" in error?error.code:undefined;
  const code=typeof rawCode==="string"&&/^[a-zA-Z0-9_./-]{1,80}$/.test(rawCode)?rawCode:"unknown";
  console.error("corporate_production_entitlement_unavailable",{referenceCode,stage,code});
  return reply(false,503);
 }
}
