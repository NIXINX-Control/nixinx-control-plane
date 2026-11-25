// Read-only Vercel routing inventory. Absence is not global DNS availability.
type Obj=Record<string,unknown>;
const obj=(v:unknown):v is Obj=>!!v&&typeof v==="object"&&!Array.isArray(v);
export function inspectApexRouting(hostname:string,projectId:string,domains:unknown[]){
 if(!/^[a-z0-9-]+\.[a-z0-9-]+\.nixinx\.app$/.test(hostname)||!/^prj_[A-Za-z0-9]{8,80}$/.test(projectId))throw Error("ROUTING_INPUT_INVALID");
 if(domains.length>500||!domains.every(d=>obj(d)&&typeof d.name==="string"&&typeof d.projectId==="string"))throw Error("ROUTING_INVENTORY_UNVERIFIED");
 const exact=domains.filter(d=>obj(d)&&String(d.name).toLowerCase()===hostname);
 const wildcard=domains.filter(d=>obj(d)&&typeof d.name==="string"&&d.name.startsWith("*.")&&hostname.endsWith(d.name.slice(1).toLowerCase()));
 if(wildcard.length||exact.length>1)return "ROUTING_CONFLICT_REVIEW_REQUIRED";
 if(!exact.length)return "NOT_ASSIGNED_IN_VISIBLE_TEAM_APEX";
 const d=exact[0] as Obj;
 if(d.projectId!==projectId||d.verified!==true||d.redirect!==null||d.gitBranch!==null||d.customEnvironmentId!==null)return "ROUTING_CONFLICT_REVIEW_REQUIRED";
 return "EXISTING_EXPECTED_PROJECT_REVIEW_REQUIRED";
}
export function inspectRegisteredRelease(expected:{sourceCommit:string;deploymentId:string},actual:{sourceCommit:string;release:{sourceCommit:string;deploymentId:string}|null}){
 return actual.sourceCommit===expected.sourceCommit&&actual.release?.sourceCommit===expected.sourceCommit&&actual.release.deploymentId===expected.deploymentId;
}

export function inspectDnsConfig(value:unknown){
 if(!obj(value)||typeof value.misconfigured!=="boolean"||!Array.isArray(value.conflicts)||!Array.isArray(value.aValues)||!Array.isArray(value.cnames))throw Error("DNS_CONFIGURATION_RESPONSE_UNVERIFIED");
 if(value.conflicts.length||value.misconfigured)return {status:"BLOCKED" as const,reason:"DNS_PROVIDER_CONFLICT_OR_MISCONFIGURATION"};
 return {status:"VERIFY" as const,reason:"DNS_PROVIDER_CONFIG_NO_REPORTED_CONFLICT_ASSIGNMENT_PENDING"};
}
