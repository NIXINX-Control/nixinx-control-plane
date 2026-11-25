import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
test("durable HTL plan is recovered and replayed once without granting access",async()=>{
 const docs=new Map();
 const collection=path=>({
   doc:(id="audit")=>({path:path+"/"+id,collection:key=>collection(path+"/"+id+"/"+key),get:async()=>({data:()=>docs.get(path+"/"+id)})}),
   orderBy:()=>({limit:()=>({get:async()=>({docs:[...docs.entries()].filter(([k])=>k.startsWith(path+"/")).map(([,v])=>({data:()=>v}))})})})
 });
 const db={collection,runTransaction:fn=>fn({
   get:async ref=>({exists:docs.has(ref.path)}),create:(ref,val)=>{assert.ok(!docs.has(ref.path));docs.set(ref.path,val)}
 })};
 const p={tenantId:"HTL",appId:"initiatives",hostname:"htl.initiatives.nixinx.app",writes:0,applyAuthorized:false,sourceCommit:"a".repeat(40),
   runtimeConfigEvidence:{configDigest:"b".repeat(64),reason:"RUNTIME_CONFIG_CANDIDATE_VALIDATED_PENDING_APPLY",checkedAt:"test"},
   providerEvidence:{releaseVerified:true,reason:"NOT_ASSIGNED_IN_VISIBLE_TEAM_APEX",dns:{reason:"DNS_PROVIDER_CONFIG_NO_REPORTED_CONFLICT_ASSIGNMENT_PENDING"},checkedAt:"test"},steps:[]};
 const deps={"node:crypto":await import("node:crypto"),"@/lib/server":{db,superadminUser:async()=>"staff",ok:x=>Response.json(x),fail:()=>new Response(null,{status:409}),ApiError:Error},"../plan/route":{GET:async()=>Response.json(p)}};
 const path="../src/app/api/admin/provisioning/client/installation-plan/route.ts";
 const src=ts.transpileModule(readFileSync(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const api={};Function("require","exports",src)(name=>deps[name],api);
 const env=process.env.VERCEL_ENV;process.env.VERCEL_ENV="production";
 try{
  const req={nextUrl:new URL("https://example.test/?tenantId=HTL")};
  const first=await(await api.POST(req)).json(), again=await(await api.POST(req)).json();
  assert.equal(first.durablePlan.created,true);assert.equal(again.durablePlan.created,false);assert.equal(docs.size,2);
  assert.equal((await(await api.GET(req)).json()).durablePlan.planId,first.durablePlan.planId);
  assert.equal([...docs.values()][0].applyAuthorized,false);
  p.steps.push({status:"BLOCKED"});assert.equal((await api.POST(req)).status,409);assert.equal(docs.size,2);
 }finally{if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env}
});