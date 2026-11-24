// Read-only preflight for the current Control catalog. No external operations,
// credentials, license transitions or provisioning writes are permitted here.
export type RecordView=Record<string,unknown>;
export type PlanInput={appId:string;tenantId?:string};
export type PlanSnapshot={
 app?:RecordView;tenant?:RecordView;configuration?:RecordView;installation?:RecordView;license?:RecordView;
 firebaseOwner?:RecordView;appCaseConflict?:boolean;tenantCaseConflict?:boolean;
};
type Step={resource:string;action:"REUSE"|"MISSING"|"BLOCKED"|"VERIFY";reason:string};
const id=/^[A-Za-z0-9_-]{2,80}$/;
const newId=/^[a-z](?:[a-z0-9-]{0,37}[a-z0-9])$/;
export function parsePlanInput(input:unknown):PlanInput{
 if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Invalid plan request");
 const v=input as RecordView;
 if(Object.keys(v).some(k=>!["appId","tenantId"].includes(k))||
    typeof v.appId!=="string"||!id.test(v.appId)||
    (v.tenantId!==undefined&&(typeof v.tenantId!=="string"||!id.test(v.tenantId))))throw new Error("Invalid plan request");
 return {appId:v.appId,...(typeof v.tenantId==="string"?{tenantId:v.tenantId}:{})};
}
// The existing Configurations contract requires lowercase IDs as hostname labels.
// Never silently lowercase a historical ID or invent a binding.
export function planHostname(input:PlanInput):string|undefined{
 return input.tenantId&&newId.test(input.tenantId)&&newId.test(input.appId)
  ?input.tenantId+"."+input.appId+".nixinx.app":undefined;
}
export function buildProvisioningPlan(input:PlanInput,s:PlanSnapshot){
 const steps:Step[]=[];
 const add=(resource:string,action:Step["action"],reason:string)=>steps.push({resource,action,reason});
 const catalog=(resource:string,record:RecordView|undefined,value:string,conflict:boolean|undefined)=>{
  if(conflict)add(resource,"BLOCKED","CASE_INSENSITIVE_ID_CONFLICT");
  else if(!record)add(resource,newId.test(value)?"MISSING":"BLOCKED",newId.test(value)?"CATALOG_RECORD_MISSING":"LEGACY_ID_NOT_REGISTERED");
  else add(resource,record.status==="active"?"REUSE":"BLOCKED",record.status==="active"?"CATALOG_RECORD_ACTIVE":"CATALOG_RECORD_NOT_ACTIVE");
 };
 catalog("application",s.app,input.appId,s.appCaseConflict);
 add("productRequirements","VERIFY","REPOSITORY_MANIFEST_AND_PROVIDER_REQUIREMENTS_NOT_VERIFIED");
 const hostname=planHostname(input);
 if(input.tenantId){
  catalog("tenant",s.tenant,input.tenantId,s.tenantCaseConflict);
  if(!hostname)add("hostname","BLOCKED","EXPLICIT_LEGACY_HOSTNAME_BINDING_REQUIRED");
  else{
   add("hostname","VERIFY","VERCEL_DOMAIN_OWNERSHIP_AND_ROUTING_NOT_VERIFIED");
   const binding=(r:RecordView)=>r.tenantId===input.tenantId&&r.appId===input.appId&&r.hostname===hostname;
   const cfg=s.configuration,inst=s.installation;
   const firebase=cfg?.firebase;
   const project=firebase&&typeof firebase==="object"&&!Array.isArray(firebase)?(firebase as RecordView).projectId:undefined;
   const projectValid=typeof project==="string"&&/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project);
   const cfgConflict=Boolean(cfg&&(!binding(cfg)||!projectValid));
   const ownerConflict=Boolean(s.firebaseOwner&&(s.firebaseOwner.tenantId!==input.tenantId||s.firebaseOwner.projectId!==project));
   if(!cfg)add("configuration","MISSING","CONFIGURATION_RECORD_MISSING");
   else if(cfgConflict||ownerConflict)add("configuration","BLOCKED","CONFIGURATION_OR_FIREBASE_OWNERSHIP_CONFLICT");
   else if(!s.firebaseOwner)add("configuration","VERIFY","FIREBASE_OWNER_REGISTRY_MISSING");
   else add("configuration","REUSE","MATCHING_CONFIGURATION_RECORD_ONLY");
   if(!inst)add("installation","MISSING","INSTALLATION_RECORD_MISSING");
   else if(!binding(inst)||inst.environment!=="production"||
     (cfg&&(!projectValid||inst.firebaseProjectId!==project||inst.orgId!==cfg.orgId)))
    add("installation","BLOCKED","INSTALLATION_BINDING_CONFLICT");
   else if(inst.status==="disabled")add("installation","BLOCKED","INSTALLATION_DISABLED");
   else add("installation","VERIFY","INSTALLATION_RECORD_EXISTS_RUNTIME_NOT_VERIFIED");
  }
  if(!s.license)add("license","MISSING","LICENSE_RECORD_MISSING");
  else if(s.license.tenantId!==input.tenantId||s.license.appId!==input.appId)
   add("license","BLOCKED","LICENSE_BINDING_CONFLICT");
  else add("license","VERIFY","EXISTING_LICENSE_PRESERVED_NO_COMMERCIAL_DECISION");
  add("cloudResources","VERIFY","CLIENT_OWNERSHIP_BILLING_PERMISSIONS_AND_PROVIDER_RESOURCES_NOT_VERIFIED");
 }
 return {mode:"PLAN_READ_ONLY" as const,scenario:input.tenantId?(s.tenant?"EXISTING_CLIENT_PRODUCT":"NEW_CLIENT_PRODUCT"):"PRODUCT_REGISTRATION",
  appId:input.appId,...(input.tenantId?{tenantId:input.tenantId}:{}),...(hostname?{hostname}:{}),
  steps,status:steps.some(x=>x.action==="BLOCKED")?"BLOCKED":"DISCOVERY_REQUIRED",
  technicalReady:false,commercialAuthorized:false,writes:0};
}
