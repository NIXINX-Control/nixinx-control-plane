import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const src=fs.readFileSync(new URL("../src/lib/service-entitlement.ts",import.meta.url),"utf8");
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {verifyServiceToken,parseServiceRequest,installationAuthorized,supportReference}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const secret="a-private-secret-for-nixinx-testing-only-"+ "x".repeat(20);
const request={tenantId:"nelcy",appId:"corporate",hostname:"nelcy-preview.corporate.nixinx.app",environment:"preview"};

test("service token is server-only and rejects unset, short, mismatched or missing credentials",()=>{
 assert.equal(verifyServiceToken("Bearer "+secret,secret),true);
 assert.equal(verifyServiceToken("Bearer wrong",secret),false);
 assert.equal(verifyServiceToken("Bearer "+secret,undefined),false);
 assert.equal(verifyServiceToken("Bearer "+secret,"too-short"),false);
 assert.equal(verifyServiceToken(null,secret),false);
});
test("services cannot request other applications or unapproved domain forms",()=>{
 assert.deepEqual(parseServiceRequest(request),request);
 for(const bad of [
  {...request,appId:"supply"},
  {...request,hostname:"nelcy.corporate.attacker.example"},
  {...request,hostname:"corporate.nixinx.app"},
  {...request,tenantId:"../"},
  {...request,environment:"unknown"},
  {...request,extra:"override"}
 ])assert.throws(()=>parseServiceRequest(bad));
});
test("deny unless verified installation, active tenant/app and exact environment match",()=>{
 const install={...request,status:"active",verified:true};
 const tenant={status:"active"},app={status:"active"};
 assert.equal(installationAuthorized(request,install,tenant,app),true);
 for(const i of [
  undefined,{...install,verified:false},{...install,status:"draft"},
  {...install,tenantId:"other"},{...install,hostname:"other.corporate.nixinx.app"},
  {...install,environment:"production"}
 ]) assert.equal(installationAuthorized(request,i,tenant,app),false);
 assert.equal(installationAuthorized(request,install,{status:"archived"},app),false);
 assert.equal(installationAuthorized(request,install,tenant,{status:"archived"}),false);
});
test("support code does not contain a commercial reason",()=>{
 assert.match(supportReference(),/^NX-[A-F0-9]{10}$/);
});
