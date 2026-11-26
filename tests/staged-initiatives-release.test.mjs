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
 "@/lib/product-discovery":{parseProductDiscoveryInput:x=>x},
 "@/lib/product-discovery-provider":{discoverProduct:async()=>({sourceCommit:current,manifest:{requirements:{accessModes:["individual"]}}})},
 "@/lib/client-provider-preflight-provider":{readRoutingEvidence:async()=>({reason:"NOT_ASSIGNED_IN_VISIBLE_TEAM_APEX",dns:{reason:"DNS_PROVIDER_CONFIG_NO_REPORTED_CONFLICT_ASSIGNMENT_PENDING"}})}};
 const api={}; const read=async url=>Response.json(url.includes("/v6/")?{deployments:[{uid:staged.id,meta:staged.meta}]}:url.includes("initiatives.nixinx.app")?live:staged);
 Function("require","exports","fetch",src)(n=>deps[n],api,read);
 const verify=()=>api.stagedInitiativesRelease(prior,live.id);
 assert.equal((await verify()).deploymentId,staged.id);
 staged.target="preview";await assert.rejects(verify,/STAGED_DEPLOYMENT_MISMATCH/);
 staged.target="production";live.gitSource.sha=current;await assert.rejects(verify,/STAGED_ROUTING_MISMATCH/);
});

test("pinned APPLY reuses only the exact assigned production deployment, independently of main",async()=>{
 const src=ts.transpileModule(readFileSync(new URL("../src/lib/staged-initiatives-release.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const product={appId:"initiatives",repository:"NIXINX-Software/initiatives-portal",vercelProjectId:"prj_6NzsF9pc0Z6BNtY8yHzSjAUnAkYV"};
 const target={id:"dpl_candidate123",projectId:product.vercelProjectId,target:"production",readyState:"READY",meta:{githubCommitSha:"b".repeat(40),githubCommitRef:"main"}};
 const baseline={...target,id:"dpl_baseline123",meta:{...target.meta,githubCommitSha:"a".repeat(40)}};
 const hosting={id:product.vercelProjectId,accountId:"team",link:{type:"github",org:"NIXINX-Software",repo:"initiatives-portal",productionBranch:"main"}};
 let alias=target;
 let reason="EXISTING_EXPECTED_PROJECT_REVIEW_REQUIRED", dns="VERIFY";
 const deps={"server-only":{},"@/lib/product-discovery":{parseProductDiscoveryInput:x=>x},"@/lib/provider-connections":{getProviderToken:async()=>"test",providerTeam:()=>"team"},
  "@/lib/product-discovery-provider":{discoverProduct:async()=>{throw Error("Do not consult moving main")}},
  "@/lib/client-provider-preflight-provider":{readRoutingEvidence:async()=>({status:"VERIFY",reason,dns:{status:dns,reason:"DNS_PROVIDER_CONFIG_NO_REPORTED_CONFLICT_ASSIGNMENT_PENDING"}})}};
 const fetch=async url=>{const path=new URL(url).pathname;return Response.json(path.startsWith("/v9/projects/")?hosting:path.endsWith(target.id)?target:path.endsWith(baseline.id)?baseline:alias)};
 const api={};Function("require","exports","fetch",src)(n=>deps[n],api,fetch);
 const input={...product,hostname:"acme.initiatives.nixinx.app",sourceCommit:target.meta.githubCommitSha,deploymentId:target.id,registeredCommit:baseline.meta.githubCommitSha,previousDeploymentId:baseline.id};
 const verify=()=>api.verifyPinnedInstallationRelease(input);
 assert.equal((await verify()).assigned,true);
 alias=baseline;await assert.rejects(verify,/PINNED_HOSTNAME_DEPLOYMENT_MISMATCH/);
 reason="NOT_ASSIGNED_IN_VISIBLE_TEAM_APEX";assert.equal((await verify()).assigned,false);
 dns="BLOCKED";await assert.rejects(verify,/PINNED_ROUTING_MISMATCH/);
 dns="VERIFY";target.target="preview";await assert.rejects(verify,/PINNED_RELEASE_MISMATCH/);
 target.target="production";hosting.accountId="other";await assert.rejects(verify,/PINNED_PROJECT_BINDING_MISMATCH/);
});
