import "server-only";
import {validTeam,type ProviderId} from "@/lib/provider-connections-policy";
import {githubConnectionStatus,getGithubRepositoryToken} from "@/lib/github-app-provider";
import {vercelConnectionStatus,getVercelIntegrationToken} from "@/lib/vercel-integration-provider";
import {ProviderConnectionError,custodyProject} from "@/lib/control-secret-vault";
export {ProviderConnectionError,custodyProject};
export function providerTeam(){
 const t=process.env.NIXINX_PROVISIONING_VERCEL_TEAM_ID||"";
 if(!validTeam(t))throw new ProviderConnectionError("VERCEL_TEAM_NOT_CONFIGURED");
 return t;
}
export async function getProviderToken(id:ProviderId,repository?:string){
 if(id==="github"&&repository)return getGithubRepositoryToken(repository);
 if(id==="vercel")return getVercelIntegrationToken();
 throw new ProviderConnectionError("GITHUB_REPOSITORY_REQUIRED");
}
export async function connectionStatus(id:ProviderId){
 if(id==="github")return githubConnectionStatus();
 return vercelConnectionStatus();
}
