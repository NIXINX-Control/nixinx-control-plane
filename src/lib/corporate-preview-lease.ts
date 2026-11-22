import "server-only";
import {getApps,initializeApp} from "firebase-admin/app";
import {getFirestore,FieldValue,Timestamp} from "firebase-admin/firestore";
import {adminApp} from "@/lib/server";

const EXPIRY_MILLISECONDS=30_000;
const SBX_PROJECT=/^nixinx-[a-z0-9-]*-sbx-[0-9]{2}$/;
const ORG_ID=/^[a-z][a-z0-9-]{1,79}$/;

export type SandboxLeaseBinding={
  tenantId:string;orgId:string;hostname:string;
};

export function leaseConfigurationValid(
 projectId:string|undefined,
 orgId:string|undefined,
 binding:SandboxLeaseBinding
):boolean{
 return Boolean(
  projectId && SBX_PROJECT.test(projectId) &&
  projectId!=="nelcy-corporate-group" &&
  orgId && ORG_ID.test(orgId) &&
  binding.orgId===orgId &&
  binding.tenantId.trim() &&
  binding.hostname.endsWith(".corporate.nixinx.app")
 );
}

export function leasePayload(
 binding:SandboxLeaseBinding,
 allowed:boolean,
 now:Date
){
 const expiresAt=new Date(now.getTime()+(allowed?EXPIRY_MILLISECONDS:0));
 return {
  tenantId:binding.tenantId,
  appId:"corporate" as const,
  environment:"preview" as const,
  hostname:binding.hostname,
  active:allowed,
  expiresAt,
 };
}

/**
 * Backend-only mirror to a SYNTHETIC Corporate sandbox.
 * Authorization is obtained from Control first; this grants no authority to browser SDKs.
 * Hard guard against accidentally targeting customer production Firestore.
 */
export async function syncCorporatePreviewLease(
 binding:SandboxLeaseBinding,
 allowed:boolean
):Promise<void>{
 const projectId=process.env.NIXINX_CONTROL_CORPORATE_SANDBOX_PROJECT_ID;
 const orgId=process.env.NIXINX_CONTROL_CORPORATE_SANDBOX_ORG_ID;
 if(!leaseConfigurationValid(projectId,orgId,binding))
  throw new Error("Corporate sandbox lease target not configured/verified");
 const sourceCredential=adminApp.options.credential;
 if(!sourceCredential)throw new Error("Server Firebase credential unavailable");
 const name="nixinx-corporate-preview-lease";
 const app=getApps().find(x=>x.name===name)??initializeApp({
  credential:sourceCredential,projectId
 },name);
 const payload=leasePayload(binding,allowed,new Date());
 await getFirestore(app).doc("organizations/"+binding.orgId+"/nixinxControl/access").set({
  ...payload,
  expiresAt:Timestamp.fromDate(payload.expiresAt),
  updatedAt:FieldValue.serverTimestamp()
 },{merge:false});
}
