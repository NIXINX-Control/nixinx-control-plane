import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const code=fs.readFileSync(new URL("../src/lib/provider-connections-policy.ts",import.meta.url),"utf8");
const {parseCredentialInput,validProject,validTeam,probeUrl,probeResult,secretIds}=await import("data:text/javascript;base64,"+Buffer.from(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString("base64"));
const token="synthetic_test_token_123456";
test("credential input rejects arbitrary providers, URLs, secret names and invalid tokens",()=>{
 assert.deepEqual(parseCredentialInput({provider:"github",token}),{provider:"github",token});
 for(const value of [{provider:"stripe",token},{provider:"github",token,url:"https://example.org"},{provider:"github",token,project:"customer"},{provider:"github",token:"a b c"},{provider:"vercel",token:"short"}])assert.throws(()=>parseCredentialInput(value));
});
test("fixed provider destinations and vault secret IDs",()=>{
 assert.equal(probeUrl("github",""),"https://api.github.com/user");
 assert.equal(probeUrl("vercel","team_123456789"),"https://api.vercel.com/v2/teams/team_123456789");
 assert.throws(()=>probeUrl("vercel","../../other"));assert.equal(validTeam("team_123456789"),true);
 assert.equal(validProject("nixinx-control"),true);assert.equal(validProject("../other"),false);
 assert.deepEqual(Object.keys(secretIds),["github","vercel"]);
});
test("identity success never inferred from HTTP 200 alone; wrong team fails",()=>{
 assert.equal(probeResult("github",200,{login:"operator",id:1},""),"IDENTITY_VERIFIED");
 assert.equal(probeResult("github",200,{},""),"UNVERIFIED");
 assert.equal(probeResult("vercel",200,{id:"team_other123"},"team_123456789"),"UNVERIFIED");
 assert.equal(probeResult("vercel",200,{id:"team_123456789"},"team_123456789"),"IDENTITY_VERIFIED");
 assert.equal(probeResult("github",403,{login:"operator",id:1},""),"ACCESS_DENIED");
});
