// P03-02: read-only provider adapter. No credential acquisition or IAM changes.
// A trusted caller must establish the tenant/project authorization before use.
type Json=Record<string,unknown>;
type Fetcher=typeof fetch;
export type GoogleProjectBinding={projectId:string;projectNumber:string;organizationId:string;webAppId:string};
const project=/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const number=/^[0-9]{1,30}$/;
const object=(v:unknown):Json=>{if(!v||typeof v!=="object"||Array.isArray(v))throw Error("GOOGLE_RESPONSE_INVALID");return v as Json};
export function validateGoogleBinding(b:GoogleProjectBinding){
 if(!project.test(b.projectId)||!number.test(b.projectNumber)||!number.test(b.organizationId)||!/^1:[0-9]+:web:[a-fA-F0-9]+$/.test(b.webAppId)||b.webAppId.split(":")[1]!==b.projectNumber)throw Error("GOOGLE_BINDING_INVALID");
}
export async function discoverGoogleProject(b:GoogleProjectBinding,accessToken:string,request:Fetcher=fetch){
 validateGoogleBinding(b);
 if(!accessToken||typeof accessToken!=="string"||/[\r\n]/.test(accessToken))throw Error("GOOGLE_DELEGATED_TOKEN_REQUIRED");
 async function get(url:string,operation:string){
  const res=await request(url,{method:"GET",headers:{Authorization:"Bearer "+accessToken,Accept:"application/json"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
  if(!res.ok)throw Error(operation+(res.status===403?"_ACCESS_DENIED":res.status===401?"_UNAUTHENTICATED":res.status===404?"_NOT_FOUND":"_FAILED"));
  return object(await res.json());
 }
 async function pages(base:string,field:string,operation:string){
  const results:Json[]=[];const seen=new Set<string>();let next="";
  for(let i=0;i<20;i++){
   const u=new URL(base);if(next)u.searchParams.set("pageToken",next);
   const page=await get(u.toString(),operation);
   const rows=page[field]??[];
   if(!Array.isArray(rows))throw Error(operation+"_INVALID");
   results.push(...rows.map(object));if(results.length>2000)throw Error(operation+"_LIMIT");
   if(!page.nextPageToken)return results;
   if(typeof page.nextPageToken!=="string"||seen.has(page.nextPageToken))throw Error(operation+"_PAGINATION_INVALID");
   next=page.nextPageToken;seen.add(next);
  }throw Error(operation+"_LIMIT");
 }
 const p=await get("https://cloudresourcemanager.googleapis.com/v3/projects/"+b.projectNumber,"GOOGLE_PROJECT");
 if(p.name!=="projects/"+b.projectNumber||p.projectId!==b.projectId||p.parent!=="organizations/"+b.organizationId||p.state!=="ACTIVE")throw Error("GOOGLE_PROJECT_BINDING_MISMATCH");
 const f=await get("https://firebase.googleapis.com/v1beta1/projects/"+b.projectId,"FIREBASE_PROJECT");
 if(f.projectId!==b.projectId||String(f.projectNumber)!==b.projectNumber)throw Error("FIREBASE_PROJECT_BINDING_MISMATCH");
 const apps=await pages("https://firebase.googleapis.com/v1beta1/projects/"+b.projectId+"/webApps","apps","FIREBASE_WEB_APPS");
 const app=apps.filter(a=>a.appId===b.webAppId&&a.projectId===b.projectId&&a.state==="ACTIVE");
 if(app.length!==1)throw Error("FIREBASE_WEB_APP_NOT_RECONCILED");
 const billing=await get("https://cloudbilling.googleapis.com/v1/projects/"+b.projectId+"/billingInfo","GOOGLE_BILLING");
 if(billing.projectId!==b.projectId||typeof billing.billingEnabled!=="boolean")throw Error("GOOGLE_BILLING_BINDING_MISMATCH");
 const services=await pages("https://serviceusage.googleapis.com/v1/projects/"+b.projectNumber+"/services?filter=state%3AENABLED&pageSize=200","services","GOOGLE_SERVICES");
 const enabled=services.map(s=>object(s.config).name).filter((n):n is string=>typeof n==="string").sort();
 const databases=await get("https://firestore.googleapis.com/v1/projects/"+b.projectId+"/databases","FIRESTORE_DATABASES");
 if(databases.unreachable!==undefined&&(!Array.isArray(databases.unreachable)||databases.unreachable.length))throw Error("FIRESTORE_DATABASES_INCOMPLETE");
 if(databases.nextPageToken)throw Error("FIRESTORE_DATABASES_INCOMPLETE");
 const rows=databases.databases??[];
 if(!Array.isArray(rows))throw Error("FIRESTORE_DATABASES_INVALID");
 const metadata=rows.map(v=>{const d=object(v);if(typeof d.name!=="string"||!d.name.startsWith("projects/"+b.projectId+"/databases/")||typeof d.locationId!=="string"||typeof d.type!=="string")throw Error("FIRESTORE_DATABASE_BINDING_MISMATCH");return {name:d.name,locationId:d.locationId,type:d.type}});
 return {projectId:b.projectId,projectNumber:b.projectNumber,organizationId:b.organizationId,webAppId:b.webAppId,webAppCount:apps.length,billingEnabled:billing.billingEnabled,billingAccountLinked:typeof billing.billingAccountName==="string"&&billing.billingAccountName.length>0,enabledServices:[...new Set(enabled)],databases:metadata,mode:"READ_ONLY" as const,technicalReady:false,commercialAuthorized:false};
}
