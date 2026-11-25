import "server-only";
import { getProviderToken, providerTeam } from "@/lib/provider-connections";
import { discoverProduct } from "@/lib/product-discovery-provider";
import { readRoutingEvidence } from "@/lib/client-provider-preflight-provider";

const repository = "NIXINX-Software/initiatives-portal";
const project = "prj_6NzsF9pc0Z6BNtY8yHzSjAUnAkYV";
const hostname = "htl.initiatives.nixinx.app";

export async function stagedInitiativesRelease(registeredCommit:string, registeredDeployment:string) {
  const input = {appId:"initiatives", repository, vercelProjectId:project};
  const product = await discoverProduct(input);
  const manifest = product.manifest.requirements;
  if (!manifest || manifest.accessModes.length !== 1 || manifest.accessModes[0] !== "individual" ||
      product.sourceCommit === registeredCommit) throw Error("STAGED_MANIFEST_MISMATCH");
  const token = await getProviderToken("vercel");
  const team = providerTeam();
  async function read(path:string, parameters:Record<string,string>={}) {
    const params = new URLSearchParams({...parameters,teamId:team});
    const response = await fetch("https://api.vercel.com/"+path+"?"+params,{
      headers:{Authorization:"Bearer "+token},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(7000)
    });
    if(!response.ok) throw Error("STAGED_RELEASE_UNAVAILABLE");
    return response.json();
  }
  const [live,list,routing] = await Promise.all([
    read("v13/deployments/initiatives.nixinx.app"),
    read("v6/deployments",{projectId:project,target:"production",state:"READY",limit:"20"}),
    readRoutingEvidence({vercelProjectId:project,hostname}),
  ]);
  const sha = (deployment:{gitSource?:{sha?:string};meta?:{githubCommitSha?:string}}) =>
    deployment.gitSource?.sha ?? deployment.meta?.githubCommitSha;
  if(live.id!==registeredDeployment || live.projectId!==project || sha(live)!==registeredCommit ||
     routing.reason!=="NOT_ASSIGNED_IN_VISIBLE_TEAM_APEX" ||
     routing.dns?.reason!=="DNS_PROVIDER_CONFIG_NO_REPORTED_CONFLICT_ASSIGNMENT_PENDING") throw Error("STAGED_ROUTING_MISMATCH");
  const match = list.deployments?.find((d:{uid?:string;meta?:{githubCommitSha?:string}})=>d.meta?.githubCommitSha===product.sourceCommit);
  if(!match || !/^dpl_[a-zA-Z0-9]+$/.test(match.uid)) throw Error("STAGED_DEPLOYMENT_MISSING");
  const deployment = await read("v13/deployments/"+match.uid);
  if(deployment.id!==match.uid || deployment.projectId!==project || deployment.target!=="production" ||
     deployment.readyState!=="READY" || sha(deployment)!==product.sourceCommit ||
     deployment.meta?.githubCommitRef!=="main" || deployment.id===live.id) throw Error("STAGED_DEPLOYMENT_MISMATCH");
  return {repository,vercelProjectId:project,sourceCommit:product.sourceCommit,
    deploymentId:deployment.id as string,previousDeploymentId:registeredDeployment,registeredCommit,
    routing:{...routing,dns:routing.dns},requirements:manifest};
}
