import "server-only";
import {getProviderToken,providerTeam} from "@/lib/provider-connections";
import {discoverProduct} from "@/lib/product-discovery-provider";
import {inspectApexRouting,inspectRegisteredRelease,inspectDnsConfig} from "@/lib/client-provider-preflight";
export async function clientProviderPreflight(input:{appId:string;repository:string;vercelProjectId:string;sourceCommit:string;deploymentId:string;hostname:string}){
 const at=new Date().toISOString();
 const fail=(reason:string)=>({status:"BLOCKED" as const,reason,checkedAt:at});
 let release;
 try{release=await discoverProduct({appId:input.appId,repository:input.repository,vercelProjectId:input.vercelProjectId})}catch{return fail("FRESH_PRODUCT_PROVIDER_READ_UNAVAILABLE")}
 if(!inspectRegisteredRelease(input,release))return fail("REGISTERED_PRODUCTION_RELEASE_CHANGED_OR_NOT_READY");
 try{
  const token=await getProviderToken("vercel"),team=providerTeam(),domains:unknown[]=[];
  let cursor:number|undefined;
  const seen=new Set<number>();
  for(let page=0;page<5;page++){
   const params=new URLSearchParams({teamId:team,limit:"100",...(cursor===undefined?{}:{until:String(cursor)})});
   const r=await fetch("https://api.vercel.com/v1/domains/nixinx.app/project-domains?"+params,{headers:{Authorization:"Bearer "+token,Accept:"application/json"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(7000)});
   if(!r.ok)return fail("VERCEL_APEX_INVENTORY_READ_UNAVAILABLE");
   const data=await r.json();
   if(!Array.isArray(data.projectDomains)||!data.pagination||!Object.hasOwn(data.pagination,"next"))return fail("VERCEL_APEX_INVENTORY_UNVERIFIED");
   domains.push(...data.projectDomains);
   if(data.pagination.next===null){
    const routing=inspectApexRouting(input.hostname,input.vercelProjectId,domains);
    const base={status:routing==="ROUTING_CONFLICT_REVIEW_REQUIRED"?"BLOCKED" as const:"VERIFY" as const,reason:routing,checkedAt:at,releaseVerified:true,scope:"VISIBLE_TEAM_APEX_ONLY",dnsVerified:false};
    if(base.status==="BLOCKED")return base;
    let dns:{status:"VERIFY"|"BLOCKED";reason:string}={status:"BLOCKED",reason:"DNS_PROVIDER_CONFIG_READ_UNAVAILABLE"};
    try{
     const params=new URLSearchParams({teamId:team,projectIdOrName:input.vercelProjectId,strict:"true"});
     const response=await fetch("https://api.vercel.com/v6/domains/"+encodeURIComponent(input.hostname)+"/config?"+params,{headers:{Authorization:"Bearer "+token,Accept:"application/json"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(7000)});
     if(response.ok)dns=inspectDnsConfig(await response.json());
    }catch{/* Preserve release evidence but never infer DNS availability. */}
    return {...base,dns};
   }
   const next=data.pagination.next;
   if(typeof next!=="number"||!Number.isSafeInteger(next)||seen.has(next))return fail("VERCEL_APEX_PAGINATION_UNVERIFIED");
   seen.add(next);cursor=next;
  }
  return fail("VERCEL_APEX_INVENTORY_LIMIT");
 }catch{return fail("VERCEL_APEX_INVENTORY_READ_UNAVAILABLE")}
}
