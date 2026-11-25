// New-client identity checks; all inputs are catalog snapshots, never provider claims.
type Row={id:string;data:Record<string,unknown>};
export const newTenantId=/^[a-z][a-z0-9-]{0,37}[a-z0-9]$/;
export function inspectNewTenantIdentity(id:string,tenants:Row[],drafts:Row[],registry:Record<string,unknown>|undefined,configs:Row[],installations:Row[]){
 if(!newTenantId.test(id))throw Error("TENANT_ID_INVALID");
 if([tenants,drafts,configs,installations].some(a=>a.length>500))throw Error("IDENTITY_INVENTORY_LIMIT_REVIEW_REQUIRED");
 if(tenants.some(x=>x.id.toLowerCase()===id||x.data.dnsSlug===id))throw Error("TENANT_ID_ALREADY_EXISTS");
 if(drafts.some(x=>x.id.toLowerCase()===id))throw Error("TENANT_ID_RESERVED_BY_INTAKE");
 if(registry!==undefined)throw Error("TENANT_DNS_ALREADY_REGISTERED");
 const prefix=id+".";
 if([...configs,...installations].some(x=>x.id.toLowerCase().startsWith(prefix)||(typeof x.data.hostname==="string"&&x.data.hostname.toLowerCase().startsWith(prefix))))throw Error("TENANT_DOMAIN_CONFLICT");
 if(drafts.some(x=>[x.data.hostname,(x.data.hostnameBinding as Record<string,unknown>|undefined)?.hostname].some(h=>typeof h==="string"&&h.toLowerCase().startsWith(prefix))))throw Error("TENANT_DOMAIN_CONFLICT");
 return {status:"AVAILABLE_IN_CONTROL",dnsSlug:id,domainPattern:id+".<app>.nixinx.app",writes:0};
}
