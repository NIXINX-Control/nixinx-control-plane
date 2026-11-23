export type InstallationRecord={
 hostname:string;tenantId:string;appId:"corporate";environment:"preview";
 sandboxOrgId:string;firebaseProjectId:string;status:"active";verified:true;
};
const hostnamePattern=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.corporate\.nixinx\.app$/;
const identifierPattern=/^[A-Za-z0-9_-]{2,80}$/;

export function validateInstallationInput(value:unknown):{hostname:string;tenantId:string}{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid installation request");
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!["hostname","tenantId"].includes(k))||
  typeof v.hostname!=="string"||!hostnamePattern.test(v.hostname)||
  typeof v.tenantId!=="string"||!identifierPattern.test(v.tenantId))
  throw new Error("Invalid installation request");
 return {hostname:v.hostname,tenantId:v.tenantId};
}
export function verifyInstallationManifest(
 input:{hostname:string;tenantId:string},
 expectedFirebaseProject:string|undefined,
 value:unknown
):InstallationRecord{
 if(!expectedFirebaseProject||
   !/^nixinx-corporate-sbx-[a-z0-9-]{2,12}$/.test(expectedFirebaseProject))
   throw new Error("Corporate sandbox target unavailable");
 if(!value||typeof value!=="object"||Array.isArray(value))
   throw new Error("Invalid Corporate installation manifest");
 const v=value as Record<string,unknown>;
 if(v.ready!==true||v.appId!=="corporate"||v.environment!=="preview"||
    v.hostname!==input.hostname||v.firebaseProjectId!==expectedFirebaseProject||
    typeof v.orgId!=="string"||!/^[a-z][a-z0-9-]{1,79}$/.test(v.orgId))
   throw new Error("Corporate installation identity mismatch");
 return{
  hostname:input.hostname,tenantId:input.tenantId,appId:"corporate",
  environment:"preview",sandboxOrgId:v.orgId,firebaseProjectId:expectedFirebaseProject,
  status:"active",verified:true
 };
}
