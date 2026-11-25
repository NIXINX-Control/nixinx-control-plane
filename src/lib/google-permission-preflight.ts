// Query only the delegated client's project. This is a bounded diagnostic, not an authorization gate or complete effective-IAM audit.
export const requiredMetadataPermissions=["resourcemanager.projects.get","firebase.projects.get","firebase.clients.list","serviceusage.services.list","datastore.databases.list"] as const;
export const sensitivePermissions=["datastore.entities.get","datastore.entities.list","datastore.entities.create","datastore.entities.update","datastore.entities.delete","firebaseauth.users.get","firebaseauth.users.create","firebaseauth.users.update","firebaseauth.users.delete","resourcemanager.projects.setIamPolicy","iam.serviceAccounts.create","iam.serviceAccountKeys.create","serviceusage.services.enable","firebase.clients.create","firebase.clients.update","firebase.clients.delete","secretmanager.versions.access","storage.objects.get","storage.objects.create","bigquery.tables.getData"] as const;
export const sdkPermission="firebase.clients.get";
export const checkedPermissions=[...requiredMetadataPermissions,...sensitivePermissions,sdkPermission];
export async function probeProjectPermissions(projectNumber:string,accessToken:string,request:typeof fetch=fetch){
 if(!/^[0-9]{1,30}$/.test(projectNumber)||typeof accessToken!=="string"||!accessToken||/[\r\n]/.test(accessToken))throw Error("GOOGLE_PERMISSION_INPUT_INVALID");
 let res:Response;
 try{res=await request("https://cloudresourcemanager.googleapis.com/v3/projects/"+projectNumber+":testIamPermissions",{method:"POST",headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},body:JSON.stringify({permissions:checkedPermissions}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)})}catch{throw Error("GOOGLE_PERMISSION_QUERY_FAILED")}
 if(!res.ok)throw Error(res.status===403?"GOOGLE_PERMISSION_QUERY_ACCESS_DENIED":"GOOGLE_PERMISSION_QUERY_FAILED");
 let data;try{data=await res.json()}catch{throw Error("GOOGLE_PERMISSION_RESPONSE_INVALID")}
 if(!data||typeof data!=="object"||Array.isArray(data))throw Error("GOOGLE_PERMISSION_RESPONSE_INVALID");
 const values=data.permissions??[];
 if(!Array.isArray(values)||values.some(p=>typeof p!=="string"||!checkedPermissions.some(k=>k===p)))throw Error("GOOGLE_PERMISSION_RESPONSE_INVALID");
 const found=new Set<string>(values);
 const missing=requiredMetadataPermissions.filter(p=>!found.has(p));
 const unexpected=sensitivePermissions.filter(p=>found.has(p));
 return {status:missing.length||unexpected.length?"PROJECT_PERMISSION_PREFLIGHT_REVIEW":"PROJECT_PERMISSION_PREFLIGHT_PASS",missing,unexpected,sdkConfigPermission:found.has(sdkPermission),scope:"PROJECT_TEST_IAM_PERMISSIONS_ONLY",completeIamAudit:false,resourceLevelAccessVerified:false,revocationVerified:false,segregationVerified:false};
}
