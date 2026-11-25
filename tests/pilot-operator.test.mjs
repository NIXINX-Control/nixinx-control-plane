import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";

test("declaring and correcting the pilot touches only its definition and audit", async () => {
 const id="a".repeat(64), path="clientProvisioning/HTL/installationPlans/"+id;
 const pilot=path+"/execution/pilotOperator";
 const docs=new Map([[path,{tenantId:"HTL",appId:"initiatives",accessMode:"individual"}],
   [path+"/execution/runtime",{planId:id,status:"STAGED_INACTIVE",firebase:{projectId:"hottacosleamingtonwebapp"}}]]);
 const snapshot=key=>({exists:docs.has(key),data:()=>docs.get(key),get:field=>field.split(".").reduce((v,k)=>v?.[k],docs.get(key))});
 let writes=0;
 const collection=key=>({doc:(id="entry")=>({id,key:key+"/"+id,get:async()=>snapshot(key+"/"+id),
   collection:name=>collection(key+"/"+id+"/"+name)}),orderBy:()=>({limit:()=>({})})});
 const db={collection,runTransaction:async fn=>fn({get:async()=>({docs:[{id}]}),getAll:async(...refs)=>refs.map(ref=>snapshot(ref.key)),
   set:(ref,data)=>{assert.equal(ref.key,pilot);writes++;docs.set(ref.key,data)},create:ref=>{assert.equal(ref.key,"audit/entry");writes++}})};
 class ApiError extends Error{constructor(status,msg){super(msg);this.status=status}}
 const deps={db,ApiError,superadminUser:async()=>"admin",ok:x=>Response.json(x),fail:e=>Response.json({error:e.message},{status:e.status??500})};
 const src=readFileSync(new URL("../src/app/api/admin/provisioning/client/pilot-operator/route.ts",import.meta.url),"utf8");
 const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const api={};Function("require","exports",js)(()=>deps,api);
 const previous=process.env.VERCEL_ENV;process.env.VERCEL_ENV="production";
 const save=email=>api.POST({nextUrl:new URL("https://example.test/?tenantId=HTL"),json:async()=>({planId:id,email})});
 try{
   assert.equal((await save("wrong")).status,400);assert.equal(writes,0);
   assert.equal((await (await save(" Admin@example.com ")).json()).pilotStatus,"PENDING_FIREBASE_MEMBERSHIP");
   assert.equal((await save("admin@example.com")).status,200);assert.equal(writes,2);
   assert.equal((await save("other@example.com")).status,200);assert.equal(writes,4);
   docs.get(pilot).status="APPLIED";assert.equal((await save("next@example.com")).status,409);assert.equal(writes,4);
 }finally{if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous}
});
