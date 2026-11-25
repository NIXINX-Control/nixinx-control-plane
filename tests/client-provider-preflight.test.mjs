import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const src=fs.readFileSync(new URL("../src/lib/client-provider-preflight.ts",import.meta.url),"utf8");
const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {inspectApexRouting:check,inspectRegisteredRelease:release,inspectDnsConfig:dns}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const host="htl.initiatives.nixinx.app",project="prj_12345678",base={name:host,projectId:project,verified:true,redirect:null,gitBranch:null,customEnvironmentId:null};
test("visible apex absence is not DNS availability; conflicts fail closed",()=>{assert.equal(check(host,project,[]),"NOT_ASSIGNED_IN_VISIBLE_TEAM_APEX");assert.equal(check(host,project,[base]),"EXISTING_EXPECTED_PROJECT_REVIEW_REQUIRED");for(const row of [{...base,projectId:"prj_87654321"},{...base,verified:false},{...base,gitBranch:"preview"},{...base,name:"*.initiatives.nixinx.app"}])assert.equal(check(host,project,[row]),"ROUTING_CONFLICT_REVIEW_REQUIRED");assert.throws(()=>check(host,project,[{}]),/UNVERIFIED/)});
test("exact registered deployment and source required",()=>{const a={sourceCommit:"a",deploymentId:"dpl_1"};assert.equal(release(a,{sourceCommit:"a",release:a}),true);assert.equal(release(a,{sourceCommit:"a",release:{...a,deploymentId:"dpl_2"}}),false);assert.equal(release(a,{sourceCommit:"a",release:null}),false)});

test("DNS config evidence is never a global availability claim",()=>{const config={misconfigured:false,conflicts:[],aValues:["192.0.2.1"],cnames:[]};assert.equal(dns(config).status,"VERIFY");assert.equal(dns({...config,conflicts:[{}]}).status,"BLOCKED");assert.equal(dns({...config,misconfigured:true}).status,"BLOCKED");assert.throws(()=>dns({misconfigured:false}),/UNVERIFIED/)});
