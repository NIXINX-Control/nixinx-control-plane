import {validateGoogleBinding,type GoogleProjectBinding} from "./google-discovery";
export type ClientGoogleBinding=GoogleProjectBinding&{mode:"corporate"|"client";tenantId:string;appId:string};
export function parseClientGoogleBinding(value:unknown,tenantId:string,appId:string):ClientGoogleBinding{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("GOOGLE_BINDING_INVALID");
 const v=value as Record<string,unknown>,keys=["mode","projectId","projectNumber","organizationId","webAppId"];
 if(Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k))||keys.some(k=>typeof v[k]!=="string"))throw Error("GOOGLE_BINDING_INVALID");
 if(v.mode!=="corporate"&&v.mode!=="client")throw Error("GOOGLE_BINDING_INVALID");
 const b={mode:v.mode,tenantId,appId,projectId:v.projectId,projectNumber:v.projectNumber,organizationId:v.organizationId,webAppId:v.webAppId} as ClientGoogleBinding;
 validateGoogleBinding(b);
 if(b.projectId==="nixinx-control"||b.projectNumber==="426004498210"||b.projectId==="nixinx-control-sbx-26")throw Error("GOOGLE_CONTROL_PROJECT_FORBIDDEN");
 return b;
}
export function restoreClientGoogleBinding(value:unknown,tenantId:string,appId:string){
 if(!value||typeof value!=="object")throw Error("GOOGLE_BINDING_REQUIRED");
 const v=value as Record<string,unknown>;
 if(v.tenantId!==tenantId||v.appId!==appId)throw Error("GOOGLE_BINDING_MISMATCH");
 return parseClientGoogleBinding({mode:v.mode,projectId:v.projectId,projectNumber:v.projectNumber,organizationId:v.organizationId,webAppId:v.webAppId},tenantId,appId);
}
export function sameBinding(a:ClientGoogleBinding,b:ClientGoogleBinding){return Object.keys(a).every(k=>a[k as keyof ClientGoogleBinding]===b[k as keyof ClientGoogleBinding]);}
export function providerFor(b:ClientGoogleBinding){
 const number=b.mode==="corporate"?"426004498210":b.projectNumber;
 const pool=b.mode==="corporate"?"nixinx-control-prod":"nixinx-control-delegation";
 return "//iam.googleapis.com/projects/"+number+"/locations/global/workloadIdentityPools/"+pool+"/providers/vercel-control-prod";
}
export function serviceAccountFor(b:ClientGoogleBinding){return "nixinx-provisioning-discovery@"+b.projectId+".iam.gserviceaccount.com"}
export function assertProjectOwner(owner:Record<string,unknown>|undefined,b:ClientGoogleBinding){
 if(owner&&(owner.tenantId!==b.tenantId||owner.projectId!==b.projectId||(owner.projectNumber!==undefined&&owner.projectNumber!==b.projectNumber)))throw Error("GOOGLE_PROJECT_OWNERSHIP_CONFLICT");
}
