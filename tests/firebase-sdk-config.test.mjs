import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const src=fs.readFileSync(new URL("../src/lib/firebase-sdk-config.ts",import.meta.url),"utf8");
const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {verifyFirebaseSdkConfig,sdkKeys}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const binding={projectId:"example-project",projectNumber:"123",webAppId:"1:123:web:abc"};
const config={apiKey:"synthetic-key",authDomain:"example-project.firebaseapp.com",projectId:"example-project",storageBucket:"example-project.firebasestorage.app",messagingSenderId:"123",appId:binding.webAppId};
test("SDK exact endpoint, bound identity and evidence only",async()=>{
 const result=await verifyFirebaseSdkConfig(binding,sdkKeys,"synthetic-token",async(url,opts)=>{assert.equal(url,"https://firebase.googleapis.com/v1beta1/projects/example-project/webApps/1%3A123%3Aweb%3Aabc/config");assert.equal(opts.method,"GET");assert.equal(opts.redirect,"error");return Response.json(config)});
 assert.equal(result.status,"FIREBASE_SDK_CONFIG_VERIFIED");assert.deepEqual(result.verifiedKeys,sdkKeys);assert.equal(result.valuesPersisted,false);assert.equal(result.technicalReady,false);assert.ok(!JSON.stringify(result).includes("synthetic"));
});
test("SDK rejects mismatched identity and missing manifest fields",async()=>{
 for(const c of [{...config,projectId:"other-project"},{...config,appId:"1:123:web:def"},{...config,messagingSenderId:"456"}])await assert.rejects(verifyFirebaseSdkConfig(binding,sdkKeys,"token",async()=>Response.json(c)),/BINDING_MISMATCH/);
 await assert.rejects(verifyFirebaseSdkConfig(binding,sdkKeys,"token",async()=>Response.json({...config,storageBucket:undefined})),/FIELDS_MISSING/);
});
test("SDK rejects arbitrary requirements and targets before network",async()=>{
 for(const keys of [["privateKey"],[],["apiKey","apiKey"]])await assert.rejects(verifyFirebaseSdkConfig(binding,keys,"token",async()=>{throw Error("unexpected")}),/REQUIREMENTS_INVALID/);
 await assert.rejects(verifyFirebaseSdkConfig({...binding,webAppId:"1:456:web:abc"},sdkKeys,"token",async()=>{throw Error("unexpected")}),/INPUT_INVALID/);
});
test("SDK sanitizes provider errors",async()=>{
 await assert.rejects(verifyFirebaseSdkConfig(binding,sdkKeys,"token",async()=>Response.json({error:"synthetic-key"},{status:403})),/^Error: FIREBASE_SDK_ACCESS_DENIED$/);
});
