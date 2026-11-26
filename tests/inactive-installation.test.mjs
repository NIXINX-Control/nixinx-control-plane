import test from "node:test";
import assert from "node:assert/strict";
import {isDeepStrictEqual} from "node:util";
import {readFileSync} from "node:fs";
import ts from "typescript";

for (const [tenantId,projectId] of [["HTL","hottacosleamingtonwebapp"],["ACME","acme-project"]]) test("inactive runtime staging checks providers and replays once: "+tenantId, async () => {
 const id="a".repeat(64), tenant="clientProvisioning/"+tenantId, planPath=tenant+"/installationPlans/"+id;
 const hostname=tenantId.toLowerCase()+".initiatives.nixinx.app", appId="initiatives";
 const binding={projectId,projectNumber:"123",webAppId:"1:123:web:abc",tenantId,appId};
 const requirements={sourceCommit:"old",deploymentId:"prior",repository:"NIXINX-Software/initiatives-portal",vercelProjectId:"prj_example123"};
 const target={sourceCommit:"new",registeredCommit:"old",deploymentId:"target",previousDeploymentId:"prior"};
 const plan={planId:id,tenantId,appId,hostname,version:2,accessMode:"individual",
   applyAuthorized:false,status:"PENDING_APPLY_REVIEW",configDigest:"digest",sourceCommit:"new",releaseTarget:target};
 const docs=new Map([[planPath,plan],[tenant,{tenantId,appId,googleBinding:binding,requirements}],
   ["tenants/"+tenantId,{status:"active"}],["apps/initiatives",{status:"active",provisioning:requirements}],
   ["firebaseProjectOwners/"+projectId,{tenantId,projectId,projectNumber:binding.projectNumber}]]);
 const snap=path=>({exists:docs.has(path),updateTime:{isEqual:()=>true},data:()=>docs.get(path),
   get:key=>key.split(".").reduce((v,k)=>v?.[k],docs.get(path))});
 const collection=path=>({doc:(id="audit")=>({path:path+"/"+id,get:async()=>snap(path+"/"+id),collection:key=>collection(path+"/"+id+"/"+key)}),
   orderBy:()=>({limit:()=>({})})});
 let latest=id;
 const db={collection,runTransaction:fn=>fn({get:async()=>({docs:[{id:latest}]}),getAll:async(...refs)=>refs.map(r=>snap(r.path)),
   create:(r,v)=>{assert.ok(!docs.has(r.path));docs.set(r.path,v)}})};
 class ApiError extends Error {constructor(status,message){super(message);this.status=status}}
 const config={status:"VERIFY",configDigest:"digest",candidate:{firebase:{projectId,appId:binding.webAppId,messagingSenderId:binding.projectNumber}}};
 const deps={"node:util":{isDeepStrictEqual},"@/lib/server":{db,ApiError,ok:x=>Response.json(x),
   fail:e=>Response.json({error:e.message},{status:e.status??500}),superadminUser:async()=>"operator"},
   "@/lib/client-runtime-config-preflight":{readRuntimeCandidate:async()=>config},
   "@/lib/client-google-binding":{restoreClientGoogleBinding:(b,tenant,app)=>{assert.equal(b.tenantId,tenant);assert.equal(b.appId,app);return b}},
   "@/lib/client-hostname-draft":{canonicalHostname:(tenant,app)=>tenant.toLowerCase()+"."+app+".nixinx.app"},
   "@/lib/staged-initiatives-release":{verifyPinnedInstallationRelease:async input=>{assert.equal(input.hostname,hostname);assert.equal(input.deploymentId,target.deploymentId);return {...target,hostname}}}};
 const path="../src/app/api/admin/provisioning/client/installation-apply/route.ts";
 const source=ts.transpileModule(readFileSync(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const api={};Function("require","exports",source)(name=>deps[name],api);
 const req={nextUrl:new URL("https://example.test/?tenantId="+tenantId+"&appId="+appId),json:async()=>({planId:id}),headers:new Headers()};
 const previous=process.env.VERCEL_ENV;process.env.VERCEL_ENV="production";
 try{
   const before=docs.size;
   assert.equal((await api.POST({...req,nextUrl:new URL("https://example.test/?tenantId="+tenantId+"&appId=supply")})).status,409);
   const owner=docs.get("firebaseProjectOwners/"+projectId);owner.tenantId="OTHER";
   assert.equal((await api.POST(req)).status,409);owner.tenantId=tenantId;
   latest="other";assert.equal((await api.POST(req)).status,409);
   latest=id;config.configDigest="changed";assert.equal((await api.POST(req)).status,409);
   assert.equal(docs.size,before);config.configDigest="digest";
   const first=await (await api.POST(req)).json();assert.equal(first.status,"STAGED_INACTIVE");assert.equal(first.firebase,undefined);
   assert.deepEqual(await (await api.POST(req)).json(),first);
   assert.equal(docs.size,before+2);assert.ok(docs.has(planPath+"/execution/runtime"));assert.ok(docs.has("audit/audit"));
   docs.get(planPath+"/execution/runtime").configDigest="corrupt";assert.equal((await api.POST(req)).status,409);
 }finally{if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous}
});
