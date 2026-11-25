import "server-only";
import {validTeam,type ProviderId} from "@/lib/provider-connections-policy";
import {githubConnectionStatus,getGithubRepositoryToken} from "@/lib/github-app-provider";
import {ProviderConnectionError,custodyProject} from "@/lib/control-secret-vault";
export {ProviderConnectionError,custodyProject};
export function providerTeam(){
 const t=process.env.NIXINX_PROVISIONING_VERCEL_TEAM_ID||"";
 if(!validTeam(t))throw new ProviderConnectionError("VERCEL_TEAM_NOT_CONFIGURED");
 return t;
}
export async function getProviderToken(id:ProviderId,repository?:string){
 if(id==="github"&&repository)return getGithubRepositoryToken(repository);
 // GOV-04: no PAT fallback; Vercel integration adapter must be implemented and verified.
 throw new ProviderConnectionError(id==="vercel"?"VERCEL_INTEGRATION_PENDING":"GITHUB_REPOSITORY_REQUIRED");
}
export async function connectionStatus(id:ProviderId){
 if(id==="github")return githubConnectionStatus();
 return {provider:id,custody:"SECRET_MANAGER",status:"VERCEL_INTEGRATION_PENDING",operationPermissionsVerified:false};
}
