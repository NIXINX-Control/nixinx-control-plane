// Public SDK configuration only. Never accept privileged credentials here.
export type FirebaseWebConfig = {apiKey:string;authDomain:string;projectId:string;storageBucket:string;messagingSenderId:string;appId:string};
export type TenantConfiguration = {tenantId:string;appId:string;hostname:string;firebase:FirebaseWebConfig;orgId?:string};
export class ConfigurationError extends Error {}
const reject = (message:string):never => {throw new ConfigurationError(message)};
function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=="object"||Array.isArray(value))return reject("Invalid configuration");
  return value as Record<string,unknown>;
}
function exactKeys(o:Record<string,unknown>,allowed:string[]){
  if(Object.keys(o).some(k=>!allowed.includes(k)))reject("Unsupported configuration field");
}
function value(o:Record<string,unknown>,key:string,pattern:RegExp):string{
  const v=o[key];if(typeof v!=="string"||!pattern.test(v))return reject("Invalid "+key);return v;
}
const slug=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const dns=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export function assignedHostname(tenantId:unknown,appId:unknown):string{
  const t=value({tenantId},"tenantId",slug), a=value({appId},"appId",slug);
  return t+"."+a+".nixinx.app";
}
export function parseConfiguration(input:unknown):TenantConfiguration{
  const o=object(input);exactKeys(o,["tenantId","appId","hostname","firebase","orgId"]);
  const tenantId=value(o,"tenantId",slug),appId=value(o,"appId",slug);
  const hostname=value(o,"hostname",dns);
  if(hostname!==assignedHostname(tenantId,appId))return reject("Hostname must match the assigned client and application");
  const f=object(o.firebase);exactKeys(f,["apiKey","authDomain","projectId","storageBucket","messagingSenderId","appId"]);
  const firebase:FirebaseWebConfig={
    apiKey:value(f,"apiKey",/^[A-Za-z0-9_-]{10,200}$/),
    authDomain:value(f,"authDomain",dns),
    projectId:value(f,"projectId",/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/),
    storageBucket:value(f,"storageBucket",/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/),
    messagingSenderId:value(f,"messagingSenderId",/^[0-9]{1,30}$/),
    appId:value(f,"appId",/^[0-9]+:[0-9]+:web:[A-Fa-f0-9]+$/)
  };
  if(firebase.appId.split(":")[1]!==firebase.messagingSenderId)return reject("Firebase sender and app ID do not match");
  const orgId=o.orgId===undefined||o.orgId===""?undefined:value(o,"orgId",/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/);
  return {tenantId,appId,hostname,firebase,...(orgId?{orgId}:{})};
}
export function assertConfigurationBinding(config:TenantConfiguration,tenant:Record<string,unknown>|undefined,app:Record<string,unknown>|undefined,prior:Record<string,unknown>|undefined){
  if(!tenant||tenant.status!=="active"||!app)reject("Active client and registered application required");
  if(prior){
    const p=prior.firebase as Record<string,unknown>|undefined;
    if(prior.tenantId!==config.tenantId||prior.appId!==config.appId||prior.hostname!==config.hostname||p?.projectId!==config.firebase.projectId)reject("Existing assignment cannot be remapped to another client, application or Firebase project");
    if(prior.status!=="draft")reject("Only draft configurations can be edited");
  }
}

export function assertFirebaseOwnership(config:TenantConfiguration,owner:Record<string,unknown>|undefined){
  if(owner&&(owner.tenantId!==config.tenantId||owner.projectId!==config.firebase.projectId))reject("Firebase project is already registered to another client or has an invalid owner");
}
