import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const src=fs.readFileSync(new URL("../src/lib/corporate-lease-contract.ts",import.meta.url),"utf8");
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {leaseConfigurationValid,leasePayload}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const binding={tenantId:"nelcy-sbx",orgId:"corporate-sbx",hostname:"nelcy-preview.corporate.nixinx.app"};

test("only isolated sandbox project and explicitly bound org can receive lease",()=>{
 assert.equal(leaseConfigurationValid("nixinx-corporate-sbx-26","corporate-sbx",binding),true);
 for(const project of [undefined,"nelcy-corporate-group","nixinx-control","htw-data-warehouse","nixinx-corporate-live"]){
   assert.equal(leaseConfigurationValid(project,"corporate-sbx",binding),false);
 }
 assert.equal(leaseConfigurationValid("nixinx-corporate-sbx-26","other",binding),false);
 assert.equal(leaseConfigurationValid("nixinx-corporate-sbx-26","corporate-sbx",{...binding,hostname:"attacker.example"}),false);
});
test("allowed lease has hard 30-second expiry; denied lease is already expired",()=>{
 const now=new Date("2026-11-22T18:00:00.000Z");
 const enabled=leasePayload(binding,true,now);
 const disabled=leasePayload(binding,false,now);
 assert.equal(enabled.active,true);
 assert.equal(enabled.environment,"preview");
 assert.equal(enabled.appId,"corporate");
 assert.equal(enabled.expiresAt.getTime()-now.getTime(),30000);
 assert.equal(disabled.active,false);
 assert.equal(disabled.expiresAt.getTime(),now.getTime());
});
