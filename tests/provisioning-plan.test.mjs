import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source=fs.readFileSync(new URL("../src/lib/provisioning-plan.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {parsePlanInput,planHostname,buildProvisioningPlan}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const input={appId:"corporate",tenantId:"example-a"},active={status:"active"};
const hostname="example-a.corporate.nixinx.app";
const cfg={...input,hostname,orgId:"example-org",firebase:{projectId:"example-alpha",apiKey:"never-return-this"}};
const snapshot={app:active,tenant:active,configuration:cfg,firebaseOwner:{tenantId:"example-a",projectId:"example-alpha"},installation:{...input,hostname,orgId:"example-org",firebaseProjectId:"example-alpha",environment:"production",status:"active",verified:true},license:{...input,status:"active"}};
const action=(plan,resource)=>plan.steps.find(s=>s.resource===resource)?.action;
test("product registration plan reuses catalog and still requires provider discovery",()=>{
 const p=buildProvisioningPlan(parsePlanInput({appId:"corporate"}),{app:active});
 assert.equal(p.scenario,"PRODUCT_REGISTRATION");assert.equal(action(p,"application"),"REUSE");assert.equal(p.technicalReady,false);assert.equal(p.writes,0);
});
test("new customer and new product are identified without creating records",()=>{
 const p=buildProvisioningPlan(input,{});
 assert.equal(p.scenario,"NEW_CLIENT_PRODUCT");assert.equal(action(p,"tenant"),"MISSING");assert.equal(action(p,"application"),"MISSING");assert.equal(p.writes,0);
});
test("additional product plan reuses matching records and never returns config or grants access",()=>{
 const p=buildProvisioningPlan(input,snapshot);
 assert.equal(p.scenario,"EXISTING_CLIENT_PRODUCT");assert.equal(action(p,"configuration"),"REUSE");assert.equal(action(p,"installation"),"VERIFY");assert.equal(p.commercialAuthorized,false);assert.equal(p.technicalReady,false);assert.equal(p.writes,0);
 assert.equal(JSON.stringify(p).includes("never-return-this"),false);
 assert.deepEqual(p,buildProvisioningPlan(input,snapshot));
});
test("conflicting tenant owner, host or license blocks plan",()=>{
 for(const s of [{...snapshot,firebaseOwner:{tenantId:"example-b",projectId:"example-alpha"}},{...snapshot,installation:{...snapshot.installation,hostname:"example-b.corporate.nixinx.app"}},{...snapshot,license:{tenantId:"example-b",appId:"corporate"}},{...snapshot,tenantCaseConflict:true}]){
  assert.equal(buildProvisioningPlan(input,s).status,"BLOCKED");
 }
});
test("legacy identifier is preserved; no inferred hostname or case duplicate",()=>{
 const i=parsePlanInput({appId:"corporate",tenantId:"HTW"});
 assert.equal(planHostname(i),undefined);
 const p=buildProvisioningPlan(i,{app:active,tenant:active});
 assert.equal(p.tenantId,"HTW");assert.equal(action(p,"hostname"),"BLOCKED");
});
test("disabled installation remains blocked and existing license is not activated",()=>{
 const p=buildProvisioningPlan(input,{...snapshot,installation:{...snapshot.installation,status:"disabled"},license:{...snapshot.license,status:"suspended"}});
 assert.equal(action(p,"installation"),"BLOCKED");assert.equal(p.commercialAuthorized,false);
});
test("missing owner is verification, not permission to reuse",()=>{
 const p=buildProvisioningPlan(input,{...snapshot,firebaseOwner:undefined});
 assert.equal(action(p,"configuration"),"VERIFY");
});
test("reject unknown, credential and path fields",()=>{
 for(const x of [{...input,token:"secret"},{...input,hostname:"evil.test"},{appId:"../x"},{appId:"corporate",tenantId:"a/b"},null])assert.throws(()=>parsePlanInput(x));
});
