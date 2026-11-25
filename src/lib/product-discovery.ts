// P02: pure validation of repository and hosting metadata. No provider writes,
// commercial grants, environment changes or customer data in this contract.
type Obj=Record<string,unknown>;
const object=(v:unknown):v is Obj=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const slug=/^[a-z][a-z0-9-]{0,37}[a-z0-9]$/;
const moduleId=/^[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
const repository=/^[A-Za-z0-9][A-Za-z0-9-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const project=/^prj_[A-Za-z0-9]{8,80}$/;
const sha=/^[a-f0-9]{40}$/;
const permittedOwners=new Set(["nixinx-software","nixinx-managed","nixinx-business-transformation","nixinx-control"]);
export type ProductDiscoveryInput={appId:string;repository:string;vercelProjectId:string};
export function parseProductDiscoveryInput(input:unknown):ProductDiscoveryInput{
 if(!object(input)||Object.keys(input).some(k=>!["appId","repository","vercelProjectId"].includes(k))||
  typeof input.appId!=="string"||!slug.test(input.appId)||
  typeof input.repository!=="string"||!repository.test(input.repository)||
  !permittedOwners.has(input.repository.split("/")[0].toLowerCase())||
  typeof input.vercelProjectId!=="string"||!project.test(input.vercelProjectId))throw new Error("INVALID_PRODUCT_DISCOVERY_INPUT");
 return {appId:input.appId,repository:input.repository,vercelProjectId:input.vercelProjectId};
}
const strings=(v:unknown,pattern:RegExp,max:number):v is string[]=>Array.isArray(v)&&v.length<=max&&v.every(x=>typeof x==="string"&&pattern.test(x))&&new Set(v).size===v.length;
const keys=["apiKey","authDomain","projectId","storageBucket","messagingSenderId","appId"];
const resources=new Set(["cloud-run","secret-manager","bigquery","firebase-storage","stripe"]);
const dataPlanes=new Set(["firebase-auth","firestore"]);
const accessModes=new Set(["operational-without-individual-login","email-password-admin","authenticated-user","individual"]);
const allowedList=(v:unknown,allowed:Set<string>):v is string[]=>strings(v,/^[a-z][a-z0-9-]{1,62}$/,20)&&v.every(x=>allowed.has(x));
const relativeSource=/^src\/[A-Za-z0-9_/-]+\.(?:ts|tsx|js|jsx)$/;
function label(v:unknown):v is string{return typeof v==="string"&&v.trim().length>0&&v.length<=120&&!/[\u0000-\u001f]/.test(v)}
export function parseProductManifest(value:unknown,appId:string){
 if(!object(value)||value.schemaVersion!==1||value.applicationId!==appId||!label(value.applicationName)||
   typeof value.source!=="string"||!relativeSource.test(value.source)||!label(value.moduleSource)||
   !Array.isArray(value.modules)||value.modules.length>100||!value.modules.every(m=>object(m)&&Object.keys(m).every(k=>k==="id"||k==="name")&&typeof m.id==="string"&&moduleId.test(m.id)&&label(m.name)))throw new Error("INVALID_PRODUCT_MANIFEST");
 const modules=value.modules.map(m=>({id:m.id as string,name:m.name as string}));
 if(new Set(modules.map(m=>m.id)).size!==modules.length)throw new Error("DUPLICATE_MODULE_ID");
 const basic={schemaVersion:1,applicationId:appId,applicationName:value.applicationName,source:value.source,moduleSource:value.moduleSource,modules};
 if(value.requirements===undefined)return {...basic,requirements:null};
 const r=value.requirements;
 if(!object(r)||Object.keys(r).some(k=>!["schemaVersion","hosting","dataPlane","firebaseWebConfigKeys","firestoreCollections","accessModes","rulesSource","runtimeBinding","dataAuthorization","conditionalResources","notEvidencedResources"].includes(k))||
 r.schemaVersion!==1||r.hosting!=="vercel-shared"||!allowedList(r.dataPlane,dataPlanes)||
 !strings(r.firebaseWebConfigKeys,/^[A-Za-z][A-Za-z0-9]{0,49}$/,6)||!r.firebaseWebConfigKeys.every(x=>keys.includes(x))||
 !strings(r.firestoreCollections,/^[A-Za-z][A-Za-z0-9_-]{0,119}$/,100)||
 !allowedList(r.accessModes,accessModes)||!object(r.rulesSource)||Object.keys(r.rulesSource).some(k=>!["path","kind"].includes(k))||
 typeof r.rulesSource.path!=="string"||!relativeSource.test(r.rulesSource.path)||r.rulesSource.kind!=="reference-only"||
 r.runtimeBinding!=="pending"||r.dataAuthorization!=="pending"||
 !allowedList(r.conditionalResources,resources)||!allowedList(r.notEvidencedResources,resources)||
 r.conditionalResources.some(x=>r.notEvidencedResources instanceof Array&&r.notEvidencedResources.includes(x)))throw new Error("INVALID_PRODUCT_REQUIREMENTS");
 return {...basic,requirements:{schemaVersion:1,hosting:r.hosting,dataPlane:r.dataPlane,firebaseWebConfigKeys:r.firebaseWebConfigKeys,firestoreCollections:r.firestoreCollections,accessModes:r.accessModes,rulesSource:{path:r.rulesSource.path,kind:r.rulesSource.kind},runtimeBinding:r.runtimeBinding,dataAuthorization:r.dataAuthorization,conditionalResources:r.conditionalResources,notEvidencedResources:r.notEvidencedResources}};
}
export type ProductProviderSnapshot={repository:unknown;branch:unknown;manifest:unknown;project:unknown;teamId:string};
export function reconcileProduct(input:ProductDiscoveryInput,snapshot:ProductProviderSnapshot){
 const repo=snapshot.repository,branch=snapshot.branch,hosting=snapshot.project;
 if(!object(repo)||repo.full_name!==input.repository||repo.private!==true||repo.archived!==false||repo.default_branch!=="main")throw new Error("REPOSITORY_BINDING_UNVERIFIED");
 if(!object(branch)||branch.name!=="main"||!object(branch.commit)||typeof branch.commit.sha!=="string"||!sha.test(branch.commit.sha))throw new Error("REPOSITORY_HEAD_UNVERIFIED");
 const manifest=parseProductManifest(snapshot.manifest,input.appId);
 if(!object(hosting)||hosting.id!==input.vercelProjectId||hosting.accountId!==snapshot.teamId)throw new Error("VERCEL_OWNERSHIP_UNVERIFIED");
 const link=hosting.link;
 if(!object(link)||link.type!=="github"||typeof link.org!=="string"||typeof link.repo!=="string"||link.org+"/"+link.repo!==input.repository||link.productionBranch!=="main")throw new Error("VERCEL_GIT_BINDING_UNVERIFIED");
 return {mode:"PRODUCT_DISCOVERY_READ_ONLY",appId:input.appId,repository:input.repository,sourceCommit:branch.commit.sha,vercelProjectId:input.vercelProjectId,manifest,steps:[
 {resource:"repository",action:"REUSE",reason:"PRIVATE_MAIN_VERIFIED"},
 {resource:"productManifest",action:manifest.requirements?"REUSE":"VERIFY",reason:manifest.requirements?"REQUIREMENTS_DECLARED_NOT_CERTIFIED":"PRODUCT_REQUIREMENTS_MISSING"},
 {resource:"vercelProject",action:"REUSE",reason:"TEAM_AND_GIT_BINDING_MATCH"},
 {resource:"release",action:"VERIFY",reason:"APPROVED_DEPLOYMENT_AND_DOMAIN_NOT_VERIFIED"},
 {resource:"runtime",action:"VERIFY",reason:"HOSTNAME_AND_DATA_AUTHORIZATION_PENDING"}
 ],technicalReady:false,commercialAuthorized:false,writes:0};
}
