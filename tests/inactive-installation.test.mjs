import test from "node:test";
import assert from "node:assert/strict";
import {isDeepStrictEqual} from "node:util";
import {readFileSync} from "node:fs";
import ts from "typescript";

test("inactive runtime staging checks providers, preserves the live paths and replays once", async () => {
 const id="a".repeat(64), tenant="clientProvisioning/HTL", planPath=tenant+"/installationPlans/"+id;
 const hostname="htl.initiatives.nixinx.app", projectId="hottacosleamingtonwebapp";
 const target={sourceCommit:"new",registeredCommit:"old",deploymentId:"target",previousDeploymentId:"prior"};
 const plan={planId:id,tenantId:"HTL",appId:"initiatives",hostname,version:2,accessMode:"individual",
   applyAuthorized:false,status:"PENDING_APPLY_REVIEW",configDigest:"digest",sourceCommit:"new",releaseTarget:target};
 const docs=new Map([[planPath,plan],[tenant,{tenantId:"HTL",appId:"initiatives",googleBinding:{projectId},requirements:{sourceCommit:"old",deploymentId:"prior"}}],
   ["tenants/HTL",{status:"active"}],["apps/initiatives",{status:"active",provisioning:{sourceCommit:"old",deploymentId:"prior"}}],
   ["firebaseProjectOwners/"+projectId,{tenantId:"HTL",projectId}]]);
 const snap=path=>({exists:docs.has(path),updateTime:{isEqual:()=>true},data:()=>docs.get(path),
   get:key=>key.split(".").reduce((v,k)=>v?.[k],docs.get(path))});
 const collection=path=>({doc:(id="audit")=>({path:path+"/"+id,get:async()=>snap(path+"/"+id),collection:key=>collection(path+"/"+id+"/"+key)}),
   orderBy:()=>({limit:()=>({})})});
 let latest=id;
 const db={collection,runTransaction:fn=>fn({get:async()=>({docs:[{id:latest}]}),getAll:async(...refs)=>refs.map(r=>snap(r.path)),
   create:(r,v)=>{assert.ok(!docs.has(r.path));docs.set(r.path,v)}})};
 class ApiError extends Error {constructor(status,message){super(message);this.status=status}}
 const config={status:"VERIFY",configDigest:"digest",candidate:{firebase:{projectId}}};
 const deps={"node:util":{isDeepStrictEqual},"@/lib/server":{db,ApiError,ok:x=>Response.json(x),
   fail:e=>Response.json({error:e.message},{status:e.status??500}),superadminUser:async()=>"operator"},
   "@/lib/client-runtime-config-preflight":{readRuntimeCandidate:async()=>config},
   "@/lib/staged-initiatives-release":{stagedInitiativesRelease:async()=>target}};
 const path="../src/app/api/admin/provisioning/client/installation-apply/route.ts";
 const source=ts.transpileModule(readFileSync(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const api={};Function("require","exports",source)(name=>deps[name],api);
 const req={nextUrl:new URL("https://example.test/?tenantId=HTL"),json:async()=>({planId:id}),headers:new Headers()};
 const previous=process.env.VERCEL_ENV;process.env.VERCEL_ENV="production";
 try{
   const before=docs.size;
   latest="other";assert.equal((await api.POST(req)).status,409);
   latest=id;config.configDigest="changed";assert.equal((await api.POST(req)).status,409);
   assert.equal(docs.size,before);config.configDigest="digest";
   const first=await (await api.POST(req)).json();assert.equal(first.status,"STAGED_INACTIVE");assert.equal(first.firebase,undefined);
   assert.deepEqual(await (await api.POST(req)).json(),first);
   assert.equal(docs.size,before+2);assert.ok(docs.has(planPath+"/execution/runtime"));assert.ok(docs.has("audit/audit"));
   docs.get(planPath+"/execution/runtime").configDigest="corrupt";assert.equal((await api.POST(req)).status,409);
 }finally{if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous}
});
