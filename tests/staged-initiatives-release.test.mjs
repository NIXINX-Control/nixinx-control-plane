import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
test("staged release is tied to main and the still-live baseline",async()=>{
 const path="../src/lib/staged-initiatives-release.ts";
 const src=ts.transpileModule(readFileSync(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const project="prj_6NzsF9pc0Z6BNtY8yHzSjAUnAkYV", prior="a".repeat(40), current="b".repeat(40);
 const live={id:"dpl_baseline",projectId:project,gitSource:{sha:prior}};
 const staged={id:"dpl_candidate",projectId:project,target:"production",readyState:"READY",meta:{githubCommitSha:current,githubCommitRef:"main"}};
 const deps={"server-only":{},"@/lib/provider-connections":{getProviderToken:async()=>"test",providerTeam:()=>"team"},
 "@/lib/product-discovery-provider":{discoverProduct:async()=>({sourceCommit:current,manifest:{requirements:{accessModes:["individual"]}}})},
 "@/lib/client-provider-preflight-provider":{readRoutingEvidence:async()=>({reason:"NOT_ASSIGNED_IN_VISIBLE_TEAM_APEX",dns:{reason:"DNS_PROVIDER_CONFIG_NO_REPORTED_CONFLICT_ASSIGNMENT_PENDING"}})}};
 const api={}; const read=async url=>Response.json(url.includes("/v6/")?{deployments:[{uid:staged.id,meta:staged.meta}]}:url.includes("initiatives.nixinx.app")?live:staged);
 Function("require","exports","fetch",src)(n=>deps[n],api,read);
 const verify=()=>api.stagedInitiativesRelease(prior,live.id);
 assert.equal((await verify()).deploymentId,staged.id);
 staged.target="preview";await assert.rejects(verify,/STAGED_DEPLOYMENT_MISMATCH/);
 staged.target="production";live.gitSource.sha=current;await assert.rejects(verify,/STAGED_ROUTING_MISMATCH/);
});