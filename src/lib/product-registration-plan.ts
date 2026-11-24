// P02-02: reconcile existing catalog with trusted server-side discovery.
// This is a plan only. No catalog mutations or activation are implemented.
import type {reconcileProduct} from "./product-discovery";
type Discovery=ReturnType<typeof reconcileProduct>;
type Entry={id:string;data:Record<string,unknown>};
export type ProductCatalogSnapshot={apps:Entry[];modules:Entry[]};
type Step={resource:"app"|"module"|"release";id:string;action:"CREATE_CANDIDATE"|"REUSE"|"VERIFY"|"BLOCKED";reason:string};
export function buildProductRegistrationPlan(discovery:Discovery,s:ProductCatalogSnapshot){
 const {appId,manifest}=discovery;
 const steps:Step[]=[];
 const add=(resource:Step["resource"],id:string,action:Step["action"],reason:string)=>steps.push({resource,id,action,reason});
 if(s.apps.length>500||s.modules.length>500)throw new Error("CATALOG_SNAPSHOT_LIMIT");
 if(new Set(s.apps.map(x=>x.id)).size!==s.apps.length||new Set(s.modules.map(x=>x.id)).size!==s.modules.length)throw new Error("DUPLICATE_CATALOG_DOCUMENT");
 const app=s.apps.find(x=>x.id===appId);
 const folded=appId.toLowerCase();
 const relevant=s.modules.filter(x=>x.id.toLowerCase().startsWith(folded+".")||
  (typeof x.data.appId==="string"&&x.data.appId.toLowerCase()===folded));
 if(!manifest.requirements)add("release",appId,"BLOCKED","PRODUCT_REQUIREMENTS_MISSING");
 if(s.apps.some(x=>x.id!==appId&&x.id.toLowerCase()===folded))add("app",appId,"BLOCKED","CASE_INSENSITIVE_APP_CONFLICT");
 else if(!app){
  add("app",appId,relevant.length?"BLOCKED":"CREATE_CANDIDATE",relevant.length?"ORPHAN_MODULES":"APP_MISSING_REQUIRES_APPROVED_REGISTRATION");
 }else if(app.data.status!=="active")add("app",appId,"BLOCKED","EXISTING_APP_NOT_ACTIVE");
 else{
  // Current catalog has no verified GitHub/Vercel identity binding. Name alone cannot establish ownership.
  add("app",appId,"VERIFY",app.data.name===manifest.applicationName?"EXISTING_APP_BINDING_NOT_ATTESTED":"EXISTING_APP_NAME_DIFFERS_PRESERVE");
 }
 const desired=new Map(manifest.modules.map(m=>[appId+"."+m.id,m]));
 for(const [id,m] of [...desired].sort(([a],[b])=>a.localeCompare(b))){
  const same=relevant.filter(x=>x.id.toLowerCase()===id.toLowerCase()||
   (typeof x.data.moduleId==="string"&&x.data.moduleId.toLowerCase()===m.id.toLowerCase()));
  if(same.some(x=>x.id!==id)||same.length>1){add("module",id,"BLOCKED","MODULE_ID_OR_BINDING_CONFLICT");continue;}
  const current=same[0];
  if(!current){add("module",id,"CREATE_CANDIDATE","MISSING_MODULE_DRAFT_UNVERIFIED_ONLY");continue;}
  const d=current.data;
  if(d.appId!==appId||d.moduleId!==m.id){add("module",id,"BLOCKED","MODULE_ID_OR_BINDING_CONFLICT");continue;}
  if(d.status==="retired"||!((d.status==="draft"&&d.verified===false)||(d.status==="active"&&d.verified===true))){
   add("module",id,"BLOCKED","PRESERVE_RETIRED_OR_INCONSISTENT_MODULE");continue;
  }
  add("module",id,d.name===m.name?"REUSE":"VERIFY",d.name===m.name?"PRESERVE_EXISTING_MODULE":"MODULE_NAME_DIFFERS_PRESERVE");
 }
 for(const entry of [...relevant].sort((a,b)=>a.id.localeCompare(b.id))){
  if(!desired.has(entry.id))add("module",entry.id,"VERIFY","EXTRA_OR_LEGACY_MODULE_PRESERVE");
 }
 // Product discovery cannot certify release, runtime or commercial authorization.
 add("release",appId,"VERIFY","APPROVED_RELEASE_DOMAIN_RUNTIME_AND_DATA_AUTHORIZATION_PENDING");
 return {mode:"PRODUCT_REGISTRATION_PLAN_ONLY" as const,appId,repository:discovery.repository,
  sourceCommit:discovery.sourceCommit,vercelProjectId:discovery.vercelProjectId,steps,
  status:steps.some(x=>x.action==="BLOCKED")?"BLOCKED":"REVIEW_REQUIRED",
  candidateModuleCount:steps.filter(x=>x.resource==="module"&&x.action==="CREATE_CANDIDATE").length,
  applyAuthorized:false,technicalReady:false,commercialAuthorized:false,writes:0};
}
