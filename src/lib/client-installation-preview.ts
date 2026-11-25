// Preliminary installation PLAN: catalog evidence only. Never authorizes APPLY.
type Obj=Record<string,unknown>;
const obj=(v:unknown):Obj=>v&&typeof v==="object"&&!Array.isArray(v)?v as Obj:{};
const keys=(v:unknown):string[]=>Array.isArray(v)&&v.every(k=>typeof k==="string")?v:[];
const sameList=(a:unknown,b:unknown)=>{const x=keys(a),y=keys(b);return x.length>0&&x.length===y.length&&new Set(x).size===x.length&&new Set(y).size===y.length&&x.every(k=>y.includes(k))};
const timestamp=(v:unknown)=>typeof v==="string"&&Number.isFinite(Date.parse(v));
type Status="REUSE"|"VERIFY"|"BLOCKED"|"CONDITIONAL";
type Step={resource:string;status:Status;reason:string;owner:"CLIENT"|"NIXINX"|"CLIENT_AND_NIXINX";evidence?:string};
export function buildClientInstallationPreview(tenantId:string,intake:Obj,tenant:Obj|undefined,app:Obj|undefined,owner:Obj|undefined,license:Obj|undefined,confirmedHostname?:string){
 const steps:Step[]=[];
 const add=(resource:string,status:Status,reason:string,owner:Step["owner"],evidence?:string)=>steps.push({resource,status,reason,owner,...(evidence?{evidence}:{})});
 const appId=intake.appId;
 if(intake.tenantId!==tenantId||typeof appId!=="string"||! /^[a-z][a-z0-9-]{0,37}[a-z0-9]$/.test(appId)||intake.status!=="PRELIMINARY"||intake.catalogTenantReused!==true||intake.technicalReady!==false||intake.commercialAuthorized!==false)throw Error("CLIENT_PLAN_INTAKE_NOT_ELIGIBLE");
 const req=obj(intake.requirements),product=obj(app?.provisioning),manifest=obj(product.manifest),r=obj(manifest.requirements);
 const registered=app?.status==="active"&&typeof req.sourceCommit==="string"&&/^[a-f0-9]{40}$/.test(req.sourceCommit)&&req.sourceCommit===product.sourceCommit&&typeof req.repository==="string"&&req.repository===product.repository&&typeof req.vercelProjectId==="string"&&req.vercelProjectId===product.vercelProjectId&&typeof req.deploymentId==="string"&&req.deploymentId===product.deploymentId&&manifest.applicationId===appId&&r.hosting==="vercel-shared"&&sameList(req.requiredResources,r.dataPlane)&&sameList(req.derivedFirebaseKeys,r.firebaseWebConfigKeys)&&JSON.stringify(req.conditionalResources)===JSON.stringify(r.conditionalResources);
 add("tenant",tenant?.status==="active"?"REUSE":"BLOCKED",tenant?.status==="active"?"EXACT_ACTIVE_TENANT":"TENANT_NOT_ACTIVE","NIXINX");
 add("product",registered?"REUSE":"BLOCKED",registered?"REGISTERED_MANIFEST_MATCHES_INTAKE":"REGISTERED_PRODUCT_OR_MANIFEST_CHANGED","NIXINX",registered?req.sourceCommit as string:undefined);
 add("release","VERIFY","FRESH_PROVIDER_RELEASE_AND_ROUTING_REQUIRED","NIXINX");
 const b=obj(intake.googleBinding),inv=obj(intake.googleInventory),pre=obj(intake.googlePermissionPreflight),sdk=obj(intake.googleSdkVerification);
 const bound=b.tenantId===tenantId&&b.appId===appId&&typeof b.projectId==="string"&&typeof b.projectNumber==="string"&&typeof b.organizationId==="string"&&typeof b.webAppId==="string"&&["client","corporate"].includes(String(b.mode))&&timestamp(intake.googleBindingAuthorizedAt)&&typeof intake.googleBindingAuthorizedBy==="string"&&Boolean(intake.googleBindingAuthorizedBy)&&owner?.tenantId===tenantId&&owner?.projectId===b.projectId&&owner?.projectNumber===b.projectNumber;
 const inventory=bound&&intake.googleMetadataDiscoveryVerified===true&&timestamp(inv.verifiedAt)&&inv.projectId===b.projectId&&inv.projectNumber===b.projectNumber&&inv.organizationId===b.organizationId&&inv.webAppId===b.webAppId;
 const firebase=inventory&&inv.billingEnabled===true&&inv.billingAccountLinked===true&&keys(inv.enabledServices).includes("firebase.googleapis.com")&&keys(inv.enabledServices).includes("identitytoolkit.googleapis.com")&&keys(inv.enabledServices).includes("firestore.googleapis.com")&&Array.isArray(inv.databases)&&inv.databases.some(x=>{const d=obj(x);return d.name==="projects/"+b.projectId+"/databases/(default)"&&d.type==="FIRESTORE_NATIVE"});
 const permissions=inventory&&pre.status==="PROJECT_PERMISSION_PREFLIGHT_PASS"&&pre.inventoryAt===inv.verifiedAt&&timestamp(pre.verifiedAt)&&pre.sdkConfigPermission===true&&Array.isArray(pre.missing)&&pre.missing.length===0&&Array.isArray(pre.unexpected)&&pre.unexpected.length===0;
 const sdkVerified=permissions&&registered&&sdk.status==="FIREBASE_SDK_CONFIG_VERIFIED"&&sdk.inventoryAt===inv.verifiedAt&&sdk.preflightAt===pre.verifiedAt&&sdk.sourceCommit===req.sourceCommit&&sdk.projectId===b.projectId&&sdk.webAppId===b.webAppId&&sdk.valuesPersisted===false&&timestamp(sdk.verifiedAt)&&sameList(sdk.verifiedKeys,req.derivedFirebaseKeys);
 add("googleBinding",bound?"REUSE":"BLOCKED",bound?"AUTHORIZED_BINDING_AND_OWNER_REGISTRY_MATCH":"DELEGATED_BINDING_NOT_RECONCILED","CLIENT_AND_NIXINX");
 add("firebaseResources",firebase?"REUSE":"BLOCKED",firebase?"HISTORICAL_INVENTORY_MATCHES_REQUIRED_BASE":"INVENTORY_MISSING_OR_INCOMPLETE","CLIENT",inventory?inv.verifiedAt as string:undefined);
 add("permissionPreflight",permissions?"REUSE":"BLOCKED",permissions?"HISTORICAL_BOUNDED_PREFLIGHT_MATCH":"PERMISSION_PREFLIGHT_MISSING_OR_STALE","NIXINX",permissions?pre.verifiedAt as string:undefined);
 add("sdk",sdkVerified?"REUSE":"BLOCKED",sdkVerified?"SDK_EVIDENCE_MATCHES_MANIFEST_VALUES_NOT_PERSISTED":"SDK_EVIDENCE_MISSING_OR_STALE","NIXINX",sdkVerified?sdk.verifiedAt as string:undefined);
 // No attestation or legal/technical decision is inferred from metadata.
 add("legalIdentity","VERIFY","AUTHORIZED_OPERATOR_DOCUMENT_REVIEW_REQUIRED","CLIENT_AND_NIXINX");
 add("billingPayer","VERIFY","BILLING_LINK_IS_NOT_PAYER_IDENTITY","CLIENT_AND_NIXINX");
 add("security","VERIFY","ANCESTOR_IAM_DATA_ACCESS_ISOLATION_REVOCATION_NOT_CERTIFIED","CLIENT_AND_NIXINX");
 add("hostname",confirmedHostname?"VERIFY":"BLOCKED",confirmedHostname?"PRELIMINARY_HOSTNAME_CONFIRMED_ROUTING_AND_RUNTIME_PENDING":"EXPLICIT_HOSTNAME_AND_RUNTIME_CONTRACT_REQUIRED","NIXINX",confirmedHostname);
 add("configuration","VERIFY","FRESH_SDK_RETRIEVAL_AND_CONFIGURATION_DIFF_REQUIRED","NIXINX");
 add("installation","VERIFY","DURABLE_INSTALLATION_PLAN_AND_READBACK_REQUIRED","NIXINX");
 add("runtimeAndData","VERIFY","HOSTNAME_RESOLUTION_AND_DATA_AUTHORIZATION_REQUIRED","CLIENT_AND_NIXINX");
 add("license",license&&(license.tenantId!==tenantId||license.appId!==appId)?"BLOCKED":"VERIFY",license?(license.tenantId!==tenantId||license.appId!==appId?"LICENSE_BINDING_CONFLICT":"EXISTING_LICENSE_PRESERVE"):"LICENSE_NOT_PRESENT_NO_ACTIVATION","NIXINX");
 if(registered)for(const x of keys(req.conditionalResources))add(x,"CONDITIONAL","NO_CREATION_WITHOUT_PRODUCT_REQUIREMENT_AND_AUTHORIZATION","NIXINX");
 return {mode:"CLIENT_INSTALLATION_PREVIEW_READ_ONLY",tenantId,appId,sourceCommit:registered?req.sourceCommit:null,hostname:confirmedHostname??null,steps,status:"BLOCKED_PENDING_GATES",applyAuthorized:false,technicalReady:false,commercialAuthorized:false,writes:0};
}
