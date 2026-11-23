import {createHash,randomBytes,timingSafeEqual} from "node:crypto";

export type ServiceEntitlementRequest={
 tenantId:string;appId:string;hostname:string;environment:"preview"|"production";moduleId?:string;siteId?:string;
};

export function verifyServiceToken(authorization:string|null,secret:string|undefined):boolean{
 if(!secret||secret.length<32||!authorization?.startsWith("Bearer "))return false;
 const incoming=authorization.slice(7);
 if(incoming.length<32||incoming.length>512)return false;
 const a=createHash("sha256").update(incoming).digest();
 const b=createHash("sha256").update(secret).digest();
 return timingSafeEqual(a,b);
}
const id=/^[a-zA-Z0-9_-]{2,80}$/;
const dns=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export function parseServiceRequest(value:unknown):ServiceEntitlementRequest{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid request");
 const o=value as Record<string,unknown>;
 if(Object.keys(o).some(k=>!["tenantId","appId","hostname","environment","moduleId","siteId"].includes(k)))
  throw new Error("Invalid request fields");
 if(typeof o.tenantId!=="string"||!id.test(o.tenantId)||
   o.appId!=="corporate"||typeof o.hostname!=="string"||
   !dns.test(o.hostname)||!o.hostname.endsWith(".corporate.nixinx.app")||
   (o.environment!=="preview"&&o.environment!=="production"))
   throw new Error("Invalid service scope");
 if(o.moduleId!==undefined && (typeof o.moduleId!=="string"||!id.test(o.moduleId)))
   throw new Error("Invalid module");
 if(o.siteId!==undefined&&(typeof o.siteId!=="string"||!id.test(o.siteId)))
   throw new Error("Invalid site");
 return {
  tenantId:o.tenantId,appId:"corporate",hostname:o.hostname,
  environment:o.environment as "preview"|"production",
  ...(typeof o.moduleId==="string"?{moduleId:o.moduleId}:{}),
  ...(typeof o.siteId==="string"?{siteId:o.siteId}:{})
 };
}
export function installationAuthorized(
 request:ServiceEntitlementRequest,
 installation:Record<string,unknown>|undefined,
 tenant:Record<string,unknown>|undefined,
 app:Record<string,unknown>|undefined
):boolean{
 // A control license cannot grant access to the wrong hostname, tenant or Firebase deployment.
 return Boolean(
  installation?.tenantId===request.tenantId &&
  installation?.appId===request.appId &&
  installation?.hostname===request.hostname &&
  installation?.environment===request.environment &&
  installation?.status==="active" &&
  installation?.verified===true &&
  tenant?.status==="active" &&
  app?.status==="active" &&
  (request.siteId===undefined || installation?.siteId===request.siteId)
 );
}
export function supportReference():string{
 return "NX-"+randomBytes(5).toString("hex").toUpperCase();
}

export function moduleIsVerified(
 request:ServiceEntitlementRequest,
 record:Record<string,unknown>|undefined
):boolean{
 if(!request.moduleId)return true;
 return Boolean(
  record?.appId===request.appId && record?.moduleId===request.moduleId &&
  record?.status==="active" && record?.verified===true
 );
}
