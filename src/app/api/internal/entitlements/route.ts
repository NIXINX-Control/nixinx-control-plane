import {NextRequest} from "next/server";
import {db,fail,ApiError} from "@/lib/server";
import {accessDecision,License} from "@/lib/lifecycle";
import {verifyServiceToken,parseServiceRequest,installationAuthorized,moduleIsVerified,supportReference} from "@/lib/service-entitlement";
export const runtime="nodejs";
export const dynamic="force-dynamic";

function reply(allowed:boolean,referenceCode:string,status=200){
 return Response.json({allowed,referenceCode},{status,headers:{"Cache-Control":"no-store"}});
}
export async function POST(req:NextRequest){
 const referenceCode=supportReference();
 try{
  const authorized=verifyServiceToken(req.headers.get("authorization"),process.env.NIXINX_CONTROL_CORPORATE_SERVICE_TOKEN);
  if(!authorized)throw new ApiError(401,"Service authentication required");
  const b=parseServiceRequest(await req.json().catch(()=>null));
  // One credential is scoped to this preview customer, never all Corporate tenants.
  if(b.environment!=="preview"||
     !process.env.NIXINX_CONTROL_CORPORATE_TENANT_ID||
     b.tenantId!==process.env.NIXINX_CONTROL_CORPORATE_TENANT_ID){
    return reply(false,referenceCode,403);
  }
  if(req.headers.get("content-type")?.split(";")[0].trim()!=="application/json")
    throw new ApiError(415,"JSON required");
  const [installation,tenant,app,license,moduleRecord]=await Promise.all([
    db.collection("appInstallations").doc(b.hostname).get(),
    db.collection("tenants").doc(b.tenantId).get(),
    db.collection("apps").doc(b.appId).get(),
    db.collection("licenses").doc(b.tenantId+"_"+b.appId).get(),
    b.moduleId?db.collection("appModules").doc(b.appId+"."+b.moduleId).get():Promise.resolve(null)
  ]);
  const valid=installationAuthorized(b,installation.data(),tenant.data(),app.data()) && moduleIsVerified(b,moduleRecord?.data());
  const decision=valid?accessDecision(license.exists?license.data() as License:null,new Date(),b.moduleId):{allowed:false,reason:"INSTALLATION_NOT_AUTHORIZED"};
  if(!decision.allowed){
    // No payment, license or tenant details are included in the client response.
    console.warn("nixinx_entitlement_denied",JSON.stringify({referenceCode,appId:"corporate",reason:decision.reason}));
  }
  return reply(decision.allowed,referenceCode);
 }catch(e){
  if(e instanceof ApiError&&e.status===401){
    console.warn("nixinx_entitlement_denied",JSON.stringify({referenceCode,reason:"INVALID_SERVICE_CREDENTIAL"}));
    return reply(false,referenceCode,401);
  }
  if(e instanceof Error && /Invalid request|Invalid service scope|Invalid module|Invalid site/.test(e.message))
    return reply(false,referenceCode,400);
  console.error("nixinx_entitlement_error",JSON.stringify({referenceCode,error:"UNAVAILABLE"}));
  return reply(false,referenceCode,503);
 }
}
