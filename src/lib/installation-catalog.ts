export type DraftInstallation={
 hostname:string;tenantId:string;appId:"corporate";environment:"preview";
 status:"draft";verified:false;
};
const hostnamePattern=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.corporate\.nixinx\.app$/;
const tenantPattern=/^[A-Za-z0-9_-]{2,80}$/;

export function normalizeInstallationDraft(input:unknown):DraftInstallation{
 if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Invalid installation");
 const data=input as Record<string,unknown>;
 if(Object.keys(data).some(k=>!["hostname","tenantId","appId","environment"].includes(k)))
  throw new Error("Technical installation binding must not be overwritten");
 if(typeof data.hostname!=="string"||!hostnamePattern.test(data.hostname))
  throw new Error("Corporate instance hostname is invalid");
 if(typeof data.tenantId!=="string"||!tenantPattern.test(data.tenantId))
  throw new Error("Client identifier is invalid");
 if(data.appId!=="corporate"||data.environment!=="preview")
  throw new Error("Only Corporate preview may be registered in this pilot");
 return{hostname:data.hostname,tenantId:data.tenantId,appId:"corporate",environment:"preview",status:"draft",verified:false};
}

export function canEditDraftInstallation(current:Record<string,unknown>|undefined,status:unknown):boolean{
 return Boolean(current?.environment==="preview" &&
  current?.appId==="corporate" &&
  current?.verified!==true &&
  current?.status==="draft" &&
  (status==="draft"||status==="disabled"));
}

export function statusForInstall(install:{status?:unknown;verified?:unknown}):string{
 if(install.verified===true&&install.status==="active")return "Verificada y activa";
 if(install.status==="disabled")return "Deshabilitada";
 return "Borrador — requiere verificación técnica";
}
