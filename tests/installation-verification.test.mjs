import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const s=fs.readFileSync(new URL("../src/lib/installation-verification.ts",import.meta.url),"utf8");
const js=ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {validateInstallationInput,verifyInstallationManifest}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const input={hostname:"nelcy-preview.corporate.nixinx.app",tenantId:"nelcy-sbx"};
const expectedProject="nixinx-corporate-sbx-26";
const response={ready:true,appId:"corporate",environment:"preview",hostname:input.hostname,firebaseProjectId:expectedProject,orgId:"corporate-sbx"};

test("Corporate Preview installation requires exact customer host, tenant ID, no caller-controlled verified flags",()=>{
 assert.deepEqual(validateInstallationInput(input),input);
 for(const extra of [
  {...input,verified:true},
  {...input,appId:"corporate"},
  {...input,environment:"production"},
  {...input,sandboxOrgId:"other"}
 ])assert.throws(()=>validateInstallationInput(extra));
 for(const hostname of ["foo.example.com","corporate.nixinx.app","nelcy-preview.corporate.nixinx.app.attacker.net","../evil","UPPER.corporate.nixinx.app"]){
  assert.throws(()=>validateInstallationInput({...input,hostname}));
 }
});
test("server verifies Corporate Preview Firebase and organization before binding",()=>{
 const v=verifyInstallationManifest(input,expectedProject,response);
 assert.deepEqual(v,{...input,appId:"corporate",environment:"preview",firebaseProjectId:expectedProject,sandboxOrgId:"corporate-sbx",status:"active",verified:true});
 for(const changed of [
  {...response,environment:"production"},
  {...response,hostname:"attacker.corporate.nixinx.app"},
  {...response,firebaseProjectId:"nelcy-corporate-group"},
  {...response,firebaseProjectId:"nixinx-control-sbx-26"},
  {...response,appId:"supply"},
  {...response,orgId:"nelcy-group/../../wrong"},
  {...response,ready:false}
 ])assert.throws(()=>verifyInstallationManifest(input,expectedProject,changed));
 assert.throws(()=>verifyInstallationManifest(input,undefined,response));
});
