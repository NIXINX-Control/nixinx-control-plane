// Preliminary onboarding only: no customer catalog, installation, license or cloud writes.
import {createHash} from "node:crypto";
type Obj=Record<string,unknown>;
const obj=(v:unknown):v is Obj=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const slug=/^[a-z][a-z0-9-]{0,37}[a-z0-9]$/;
export const existingIdPattern=/^[A-Za-z0-9_-]{2,80}$/;
export type Intake={mode?:"existing";tenantId:string;legalName:string;legalIdentifier:string;jurisdiction:string;contactEmail:string;appId:string};
const fields=["tenantId","legalName","legalIdentifier","jurisdiction","contactEmail","appId"] as const;
export function parseIntake(value:unknown):Intake{
 if(!obj(value)||Object.keys(value).some(k=>k!=="mode"&&!fields.includes(k as typeof fields[number]))||(value.mode!==undefined&&value.mode!=="existing"))throw Error("INVALID_INTAKE");
 const read=(k:typeof fields[number],max:number)=>{const v=value[k];if(typeof v!=="string"||!v.trim()||v.length>max||/[\x00-\x1f\x7f]/.test(v))throw Error("INVALID_INTAKE");return v.trim()};
 const tenantId=read("tenantId",value.mode==="existing"?80:39),appId=read("appId",39),contactEmail=read("contactEmail",254);
 if(!(value.mode==="existing"?existingIdPattern:slug).test(tenantId)||!slug.test(appId)||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)))throw Error("INVALID_INTAKE");
 return {...(value.mode==="existing"?{mode:"existing" as const}:{}),tenantId,appId,legalName:read("legalName",120),legalIdentifier:read("legalIdentifier",120),jurisdiction:read("jurisdiction",120),contactEmail};
}
export function legalKey(i:Intake){
 // Exact normalized pair only; this does not certify legal identity or equivalent formats.
 return createHash("sha256").update(JSON.stringify([i.jurisdiction.trim().toUpperCase(),i.legalIdentifier.trim().toUpperCase()])).digest("hex");
}
export function sameIntake(a:unknown,b:Intake){
 return obj(a)&&a.mode===b.mode&&fields.every(k=>a[k]===b[k]);
}
export function buildIntakeRequirements(appId:string,binding:unknown,manifest:unknown){
 if(!obj(binding)||typeof binding.sourceCommit!=="string"||! /^[a-f0-9]{40}$/.test(binding.sourceCommit)||
 typeof binding.repository!=="string"||typeof binding.vercelProjectId!=="string"||!/^prj_[A-Za-z0-9]{8,80}$/.test(binding.vercelProjectId)||
 typeof binding.deploymentId!=="string"||!/^dpl_[A-Za-z0-9]{8,80}$/.test(binding.deploymentId)||
 !obj(manifest)||manifest.applicationId!==appId||!obj(manifest.requirements))throw Error("PRODUCT_REGISTRATION_REQUIRED");
 const r=manifest.requirements;
 if(r.hosting!=="vercel-shared"||!Array.isArray(r.dataPlane)||!Array.isArray(r.firebaseWebConfigKeys)||!Array.isArray(r.conditionalResources))throw Error("PRODUCT_REQUIREMENTS_UNSUPPORTED");
 return {sourceCommit:binding.sourceCommit,repository:binding.repository,vercelProjectId:binding.vercelProjectId,deploymentId:binding.deploymentId,
  requiredResources:r.dataPlane,derivedFirebaseKeys:r.firebaseWebConfigKeys,conditionalResources:r.conditionalResources,
  steps:[
   {id:"legalIdentity",status:"PENDING",owner:"CLIENT_AND_NIXINX",instruction:"Verificar entidad jurídica y contacto autorizado; no equivale a consentimiento."},
   ...(r.dataPlane.includes("firebase-auth")||r.dataPlane.includes("firestore")?[{id:"clientDelegation",status:"PENDING",owner:"CLIENT",instruction:"Confirmar titular autorizado, proyecto existente o nuevo, facturación y delegación Google. No ingresar claves."}]:[]),
   {id:"providerPlan",status:"PENDING",owner:"NIXINX",instruction:"Descubrir recursos reales y permisos; generar PLAN antes de APPLY."},
   {id:"runtimeAndData",status:"PENDING",owner:"NIXINX",instruction:"Verificar hostname, configuración, autorización de datos y aislamiento."}
  ]};
}
export type CatalogTenant={id:string;status:unknown};
export function validateTenantSelection(input:Intake,tenants:CatalogTenant[],otherDraftIds:string[]){
 const matches=tenants.filter(t=>t.id.toLowerCase()===input.tenantId.toLowerCase());
 if(otherDraftIds.some(id=>id.toLowerCase()===input.tenantId.toLowerCase()&&id!==input.tenantId))throw Error("INTAKE_ID_CASE_CONFLICT");
 if(input.mode==="existing"){
  if(matches.length!==1||matches[0].id!==input.tenantId||matches[0].status!=="active")throw Error("EXISTING_TENANT_NOT_RECONCILED");
 }else if(matches.length)throw Error("EXISTING_TENANT_RECONCILIATION_REQUIRED");
}
export function intakeHostname(input:Intake):string|null{
 // Do not silently lowercase historical catalog identifiers or infer their binding.
 return slug.test(input.tenantId)?input.tenantId+"."+input.appId+".nixinx.app":null;
}
export function decideIntake(input:Intake,prior:unknown,tenantIds:string[],otherLegalKeys:string[]){
 if(prior!==undefined){
  if(!obj(prior)||prior.tenantId!==input.tenantId||!sameIntake(prior.profile,input))throw Error("INTAKE_CONFLICT");
  return "REUSE" as const;
 }
 if(input.mode!=="existing"&&tenantIds.some(t=>t.toLowerCase()===input.tenantId.toLowerCase()))throw Error("EXISTING_TENANT_RECONCILIATION_REQUIRED");
 if(otherLegalKeys.includes(legalKey(input)))throw Error("LEGAL_IDENTITY_DRAFT_CONFLICT");
 return "CREATE" as const;
}
