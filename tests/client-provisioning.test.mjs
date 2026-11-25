import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source=fs.readFileSync(new URL("../src/lib/client-provisioning.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {parseIntake,legalKey,decideIntake,buildIntakeRequirements,validateTenantSelection,intakeHostname}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const input={tenantId:"example-a",appId:"initiatives",legalName:"Synthetic company",legalIdentifier:"TEST-1",jurisdiction:"Example",contactEmail:"operator@example.invalid"};
test("preliminary intake exact input only",()=>{assert.deepEqual(parseIntake(input),input);for(const x of [{...input,token:"secret"},{...input,tenantId:"../x"},{...input,contactEmail:"bad"},{...input,legalIdentifier:""},null])assert.throws(()=>parseIntake(x));});
test("exact replay reuses and rejects conflicting profile",()=>{assert.equal(decideIntake(input,undefined,[],[]),"CREATE");const prior={tenantId:input.tenantId,profile:input};assert.equal(decideIntake(input,prior,[],[]),"REUSE");assert.throws(()=>decideIntake({...input,appId:"supply"},prior,[],[]),/INTAKE_CONFLICT/);});
test("existing catalog and legal identity draft conflicts fail closed",()=>{assert.throws(()=>decideIntake(input,undefined,["EXAMPLE-A"],[]),/EXISTING_TENANT/);assert.throws(()=>decideIntake(input,undefined,[],[legalKey({...input,jurisdiction:"example",legalIdentifier:"test-1"})]),/LEGAL_IDENTITY/);});
test("manifest driven resources are pending and conditional not required",()=>{const b={sourceCommit:"a".repeat(40),repository:"NIXINX-Software/initiatives-portal",vercelProjectId:"prj_12345678",deploymentId:"dpl_12345678"};const m={applicationId:"initiatives",requirements:{hosting:"vercel-shared",dataPlane:["firebase-auth","firestore"],firebaseWebConfigKeys:["projectId"],conditionalResources:["cloud-run"]}};const p=buildIntakeRequirements("initiatives",b,m);assert.deepEqual(p.requiredResources,["firebase-auth","firestore"]);assert.deepEqual(p.conditionalResources,["cloud-run"]);assert.ok(p.steps.every(s=>s.status==="PENDING"));assert.throws(()=>buildIntakeRequirements("supply",b,m));assert.throws(()=>buildIntakeRequirements("initiatives",{},m));});
test("existing tenant selection preserves the exact legacy identifier",()=>{
 const existing=parseIntake({...input,mode:"existing",tenantId:"HTL"});
 assert.equal(existing.tenantId,"HTL");assert.equal(intakeHostname(existing),null);
 assert.doesNotThrow(()=>validateTenantSelection(existing,[{id:"HTL",status:"active"}],[]));
 assert.equal(decideIntake(existing,undefined,["HTL"],[]),"CREATE");
 assert.equal(decideIntake(existing,{tenantId:"HTL",profile:existing},["HTL"],[]),"REUSE");
 assert.throws(()=>parseIntake({...input,tenantId:"HTL"}));
 assert.throws(()=>validateTenantSelection({...existing,tenantId:"htl"},[{id:"HTL",status:"active"}],[]));
});
test("existing tenant selection rejects missing, archived, ambiguous and case-only drafts",()=>{
 const e=parseIntake({...input,mode:"existing",tenantId:"HTL"});
 for(const tenants of [[],[{id:"HTL",status:"archived"}],[{id:"HTL",status:"active"},{id:"htl",status:"active"}]])assert.throws(()=>validateTenantSelection(e,tenants,[]));
 assert.throws(()=>validateTenantSelection(e,[{id:"HTL",status:"active"}],["htl"]));
 assert.throws(()=>validateTenantSelection(input,[{id:"EXAMPLE-A",status:"active"}],[]));
 assert.throws(()=>decideIntake(e,undefined,["HTL"],[legalKey(e)]));
});
test("lowercase canonical hostname and previous new-client intake contract preserved",()=>{
 assert.equal(intakeHostname(parseIntake(input)),"example-a.initiatives.nixinx.app");
 assert.throws(()=>parseIntake({...input,mode:"unknown"}));
 assert.throws(()=>decideIntake({...input,mode:"existing"},{tenantId:input.tenantId,profile:input},[],[]));
});
