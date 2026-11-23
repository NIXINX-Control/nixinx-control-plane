const EXPIRY_MILLISECONDS=30_000;
const SBX_PROJECT=/^nixinx-corporate-sbx-[a-z0-9-]{2,12}$/;
const ORG_ID=/^[a-z][a-z0-9-]{1,79}$/;
export type SandboxLeaseBinding={tenantId:string;orgId:string;hostname:string};

export function leaseConfigurationValid(
 projectId:string|undefined,orgId:string|undefined,binding:SandboxLeaseBinding
):boolean{
 return Boolean(
  projectId && SBX_PROJECT.test(projectId) &&
  projectId!=="nelcy-corporate-group" &&
  orgId && ORG_ID.test(orgId) &&
  binding.orgId===orgId && binding.tenantId.trim() &&
  binding.hostname.endsWith(".corporate.nixinx.app")
 );
}
export function leasePayload(binding:SandboxLeaseBinding,allowed:boolean,now:Date,cutoff=Infinity){
 return {
  tenantId:binding.tenantId,
  appId:"corporate" as const,
  environment:"preview" as const,
  hostname:binding.hostname,
  active:allowed,
  expiresAt:new Date(allowed?Math.min(now.getTime()+EXPIRY_MILLISECONDS,cutoff):now.getTime()),
 };
}
