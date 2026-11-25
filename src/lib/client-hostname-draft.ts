// Explicit preliminary hostname binding. Not a DNS reservation or runtime authorization.
type Obj=Record<string,unknown>;
const obj=(v:unknown):v is Obj=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const id=/^[A-Za-z0-9_-]{2,80}$/;
const app=/^[a-z][a-z0-9-]{0,37}[a-z0-9]$/;
const label=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const project=/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
export function canonicalTenantDnsSlug(tenantId:unknown):string{
 if(typeof tenantId!=="string"||!id.test(tenantId)||!label.test(tenantId.toLowerCase()))throw Error("TENANT_DNS_RECONCILIATION_REQUIRED");
 return tenantId.toLowerCase();
}
export function canonicalHostname(tenantId:unknown,appId:unknown):string{
 if(typeof appId!=="string"||!app.test(appId))throw Error("HOSTNAME_APP_INVALID");
 return canonicalTenantDnsSlug(tenantId)+"."+appId+".nixinx.app";
}
export function assertTenantDnsIdentity(tenantId:string,tenant:Obj|undefined,catalog:{id:string;data:Obj}[],registry:Obj|undefined){
 const slug=canonicalTenantDnsSlug(tenantId);
 if(!tenant||tenant.status!=="active"||catalog.length>500||!catalog.some(x=>x.id===tenantId)||catalog.some(x=>x.id!==tenantId&&(x.id.toLowerCase()===slug||x.data.dnsSlug===slug)))throw Error("TENANT_DNS_CONFLICT_REVIEW_REQUIRED");
 if((tenant.dnsSlug!==undefined&&tenant.dnsSlug!==slug)||(registry&&(registry.tenantId!==tenantId||registry.dnsSlug!==slug))||(tenant.dnsSlug!==undefined&&!registry)||(registry&&tenant.dnsSlug!==slug))throw Error("TENANT_DNS_CONFLICT_REVIEW_REQUIRED");
 return {slug,registered:registry!==undefined};
}
export function validDraftHostname(hostname:unknown,appId:unknown):hostname is string{
 if(typeof hostname!=="string"||typeof appId!=="string"||!app.test(appId))return false;
 const parts=hostname.split(".");
 return parts.length===4&&label.test(parts[0])&&parts[1]===appId&&parts[2]==="nixinx"&&parts[3]==="app";
}
export function parseHostnameApproval(v:unknown){
 if(!obj(v)||Object.keys(v).length!==4||Object.keys(v).some(k=>!["tenantId","appId","hostname","confirmed"].includes(k))||typeof v.tenantId!=="string"||!id.test(v.tenantId)||typeof v.appId!=="string"||!validDraftHostname(v.hostname,v.appId)||v.confirmed!==true)throw Error("HOSTNAME_APPROVAL_INVALID");
 if(v.hostname!==canonicalHostname(v.tenantId,v.appId))throw Error("HOSTNAME_NOT_CANONICAL");
 return {tenantId:v.tenantId,appId:v.appId,hostname:v.hostname};
}
export type HostnameIdentity={tenantId:string;appId:string;hostname:string;projectId:string;projectNumber:string;webAppId:string;vercelProjectId:string;sourceCommit:string};
export type HostnameDraft=HostnameIdentity&{status:"PRELIMINARY_CONFIRMED";confirmedAt:string;confirmedBy:string};
export function hostnameIdentity(input:ReturnType<typeof parseHostnameApproval>,intake:Obj):HostnameIdentity{
 const b=intake.googleBinding,r=intake.requirements;
 if(intake.tenantId!==input.tenantId||intake.appId!==input.appId||intake.status!=="PRELIMINARY"||intake.catalogTenantReused!==true||intake.technicalReady!==false||intake.commercialAuthorized!==false||!obj(b)||b.tenantId!==input.tenantId||b.appId!==input.appId||typeof b.projectId!=="string"||!project.test(b.projectId)||typeof b.projectNumber!=="string"||!/^\d{1,30}$/.test(b.projectNumber)||typeof b.webAppId!=="string"||!/^1:\d+:web:[a-fA-F0-9]+$/.test(b.webAppId)||b.webAppId.split(":")[1]!==b.projectNumber||!obj(r)||typeof r.vercelProjectId!=="string"||!/^prj_[A-Za-z0-9]{8,80}$/.test(r.vercelProjectId)||typeof r.sourceCommit!=="string"||! /^[a-f0-9]{40}$/.test(r.sourceCommit))throw Error("HOSTNAME_INTAKE_NOT_ELIGIBLE");
 return {...input,projectId:b.projectId,projectNumber:b.projectNumber,webAppId:b.webAppId,vercelProjectId:r.vercelProjectId,sourceCommit:r.sourceCommit};
}
export function matchesHostnameDraft(value:unknown,identity:HostnameIdentity):value is HostnameDraft{
 return obj(value)&&Object.entries(identity).every(([k,v])=>value[k]===v)&&value.status==="PRELIMINARY_CONFIRMED"&&typeof value.confirmedAt==="string"&&Number.isFinite(Date.parse(value.confirmedAt))&&typeof value.confirmedBy==="string"&&value.confirmedBy.length>0;
}
export function decideHostnameDraft(identity:HostnameIdentity,prior:unknown,others:{id:string;data:Obj}[],occupied:boolean){
 if(occupied||others.some(x=>x.id!==identity.tenantId&&(x.data.hostname===identity.hostname||(obj(x.data.hostnameBinding)&&x.data.hostnameBinding.hostname===identity.hostname))))throw Error("HOSTNAME_CONFLICT_REVIEW_REQUIRED");
 if(prior!==undefined&&prior!==null){if(!matchesHostnameDraft(prior,identity))throw Error("HOSTNAME_BINDING_IMMUTABLE");return "REUSE" as const}
 return "CREATE" as const;
}
