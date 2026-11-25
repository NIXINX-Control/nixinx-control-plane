import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const code=fs.readFileSync(new URL("../src/lib/vercel-integration-policy.ts",import.meta.url),"utf8");
const p=await import("data:text/javascript;base64,"+Buffer.from(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString("base64"));
const id="icfg_synthetic123",state="a".repeat(64),team=p.corporateTeam;
test("root accepts only expected credential shape",()=>{
 const r={clientId:"oac_synthetic123",clientSecret:"synthetic_secret123456"};
 assert.deepEqual(p.parseVercelRoot(r),r);
 assert.throws(()=>p.parseVercelRoot({...r,teamId:"other"}));
 assert.throws(()=>p.parseVercelRoot({...r,clientSecret:"short"}));
});
test("callback requires state, exact corporate team, configuration and external source",()=>{
 const q=new URLSearchParams({code:"synthetic-code",state,teamId:team,configurationId:id,source:"external",next:"https://vercel.com/dashboard"});
 assert.equal(p.parseCallback(q).id,id);q.set("teamId","team_other");assert.throws(()=>p.parseCallback(q));q.set("teamId",team);q.append("state",state);assert.throws(()=>p.parseCallback(q));
 assert.equal(p.safeNext("https://evil.example"),"https://controlde.nixinx.org/");
 assert.equal(p.safeNext("https://vercel.com.evil.example"),"https://controlde.nixinx.org/");
});
test("exchange and short token must match trusted installation and team",()=>{
 assert.equal(p.verifyExchange({installation_id:id,team_id:team},id),id);
 assert.throws(()=>p.verifyExchange({installation_id:id,team_id:"other"},id));
 const now=Date.now(),b={access_token:"synthetic_access_token",token_type:"Bearer",expires_in:3600,installation_id:id,team_id:team,scope:"read:project read:team read:integration-configuration"};
 assert.equal(p.parseShortToken(b,id,now).expiresAt,now+3600000);
 assert.throws(()=>p.parseShortToken({...b,installation_id:"icfg_other123"},id,now));
 assert.throws(()=>p.parseShortToken({...b,expires_in:999999},id,now));
 assert.throws(()=>p.parseShortToken({...b,scope:""},id,now));
});
