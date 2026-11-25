import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const src=fs.readFileSync(new URL("../src/lib/google-permission-preflight.ts",import.meta.url),"utf8");
const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {probeProjectPermissions,requiredMetadataPermissions,checkedPermissions}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
test("project preflight uses only exact project and bounded permission list",async()=>{
 const result=await probeProjectPermissions("123","private",async(url,opts)=>{assert.equal(url,"https://cloudresourcemanager.googleapis.com/v3/projects/123:testIamPermissions");assert.equal(opts.method,"POST");assert.deepEqual(JSON.parse(opts.body).permissions,checkedPermissions);return Response.json({permissions:requiredMetadataPermissions})});
 assert.equal(result.status,"PROJECT_PERMISSION_PREFLIGHT_PASS");assert.equal(result.completeIamAudit,false);assert.equal(result.sdkConfigPermission,false);assert.ok(!JSON.stringify(result).includes("private"));
});
test("missing metadata or excessive permissions reports review",async()=>{
 const result=await probeProjectPermissions("123","private",async()=>Response.json({permissions:["datastore.entities.get","firebase.clients.get"]}));
 assert.equal(result.status,"PROJECT_PERMISSION_PREFLIGHT_REVIEW");assert.equal(result.missing.length,5);assert.deepEqual(result.unexpected,["datastore.entities.get"]);assert.equal(result.sdkConfigPermission,true);
});
test("fails closed for invalid target or response",async()=>{
 await assert.rejects(probeProjectPermissions("other/path","private",async()=>{throw Error("unexpected")}),/INPUT_INVALID/);
 await assert.rejects(probeProjectPermissions("123","private",async()=>Response.json({permissions:["other.permission"]})),/RESPONSE_INVALID/);
 await assert.rejects(probeProjectPermissions("123","private",async()=>Response.json({error:"private"},{status:403})),/ACCESS_DENIED/);
});
