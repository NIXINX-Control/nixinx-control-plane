import "server-only";
import { getProviderToken, providerTeam } from "@/lib/provider-connections";
import { parseProductDiscoveryInput } from "@/lib/product-discovery";
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
  const alreadyAssigned = routing.reason === "EXISTING_EXPECTED_PROJECT_REVIEW_REQUIRED";
  if(live.id!==registeredDeployment || live.projectId!==project || sha(live)!==registeredCommit ||
     (!alreadyAssigned && routing.reason!=="NOT_ASSIGNED_IN_VISIBLE_TEAM_APEX") ||
     routing.dns?.reason!=="DNS_PROVIDER_CONFIG_NO_REPORTED_CONFLICT_ASSIGNMENT_PENDING") throw Error("STAGED_ROUTING_MISMATCH");
  const match = list.deployments?.find((d:{uid?:string;meta?:{githubCommitSha?:string}})=>d.meta?.githubCommitSha===product.sourceCommit);
  if(!match || !/^dpl_[a-zA-Z0-9]+$/.test(match.uid)) throw Error("STAGED_DEPLOYMENT_MISSING");
  const deployment = await read("v13/deployments/"+match.uid);
  if(deployment.id!==match.uid || deployment.projectId!==project || deployment.target!=="production" ||
     deployment.readyState!=="READY" || sha(deployment)!==product.sourceCommit ||
     deployment.meta?.githubCommitRef!=="main" || deployment.id===live.id) throw Error("STAGED_DEPLOYMENT_MISMATCH");
  if (alreadyAssigned) {
    const assigned = await read("v13/deployments/" + hostname);
    if (assigned.id !== deployment.id || assigned.projectId !== project || assigned.target !== "production" ||
        assigned.readyState !== "READY" || sha(assigned) !== product.sourceCommit) {
      throw Error("STAGED_HOSTNAME_DEPLOYMENT_MISMATCH");
    }
  }
  return {repository,vercelProjectId:project,sourceCommit:product.sourceCommit,
    deploymentId:deployment.id as string,previousDeploymentId:registeredDeployment,registeredCommit,
    routing:{...routing,dns:routing.dns},requirements:manifest};
}


// APPLY resumes the exact release authorized in a durable PLAN; main may have moved.
// This does not assign domains, publish rules, activate an installation or grant data access.
export async function verifyPinnedInstallationRelease(input: {
  appId:string; repository:string; vercelProjectId:string; hostname:string;
  sourceCommit:string; deploymentId:string; registeredCommit:string; previousDeploymentId:string;
}) {
  const product = parseProductDiscoveryInput({appId:input.appId,repository:input.repository,vercelProjectId:input.vercelProjectId});
  const validSha = (s:string) => /^[a-f0-9]{40}$/.test(s);
  const validDeployment = (s:string) => /^dpl_[A-Za-z0-9]{8,80}$/.test(s);
  if (!validSha(input.sourceCommit) || !validSha(input.registeredCommit) ||
      !validDeployment(input.deploymentId) || !validDeployment(input.previousDeploymentId) ||
      !/^[a-z0-9-]+\.[a-z0-9-]+\.nixinx\.app$/.test(input.hostname) ||
      input.hostname.split(".")[1] !== product.appId) throw Error("PINNED_RELEASE_INPUT_INVALID");
  const token = await getProviderToken("vercel"), team = providerTeam();
  async function read(path:string) {
    const response = await fetch("https://api.vercel.com/"+path+"?"+new URLSearchParams({teamId:team}), {
      headers:{Authorization:"Bearer "+token},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(7000)
    });
    if (!response.ok) throw Error("PINNED_RELEASE_UNAVAILABLE");
    return response.json();
  }
  const [hosting,target,baseline,routing] = await Promise.all([
    read("v9/projects/"+product.vercelProjectId),
    read("v13/deployments/"+input.deploymentId),
    read("v13/deployments/"+input.previousDeploymentId),
    readRoutingEvidence({vercelProjectId:product.vercelProjectId,hostname:input.hostname})
  ]);
  const link = hosting.link;
  if (hosting.id !== product.vercelProjectId || hosting.accountId !== team ||
      link?.type !== "github" || link.org+"/"+link.repo !== product.repository ||
      link.productionBranch !== "main") throw Error("PINNED_PROJECT_BINDING_MISMATCH");
  function matches(d:{id?:string;projectId?:string;target?:string;readyState?:string;gitSource?:{sha?:string};meta?:{githubCommitSha?:string;githubCommitRef?:string}},id:string,commit:string) {
    return d.id===id && d.projectId===product.vercelProjectId && d.target==="production" &&
      d.readyState==="READY" && (d.gitSource?.sha??d.meta?.githubCommitSha)===commit &&
      d.meta?.githubCommitRef==="main";
  }
  if (!matches(target,input.deploymentId,input.sourceCommit) ||
      !matches(baseline,input.previousDeploymentId,input.registeredCommit)) throw Error("PINNED_RELEASE_MISMATCH");
  const assigned = routing.reason==="EXISTING_EXPECTED_PROJECT_REVIEW_REQUIRED";
  if (routing.status!=="VERIFY" ||
      (!assigned && routing.reason!=="NOT_ASSIGNED_IN_VISIBLE_TEAM_APEX") ||
      routing.dns?.status!=="VERIFY" ||
      routing.dns.reason!=="DNS_PROVIDER_CONFIG_NO_REPORTED_CONFLICT_ASSIGNMENT_PENDING")
    throw Error("PINNED_ROUTING_MISMATCH");
  if (assigned && !matches(await read("v13/deployments/"+input.hostname),input.deploymentId,input.sourceCommit))
    throw Error("PINNED_HOSTNAME_DEPLOYMENT_MISMATCH");
  return {sourceCommit:input.sourceCommit,deploymentId:input.deploymentId,hostname:input.hostname,assigned};
}
