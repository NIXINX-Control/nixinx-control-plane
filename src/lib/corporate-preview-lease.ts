import "server-only";
import {getApps,initializeApp} from "firebase-admin/app";
import {getFirestore,FieldValue,Timestamp} from "firebase-admin/firestore";
import {adminApp} from "@/lib/server";
import {leaseConfigurationValid,leasePayload,type SandboxLeaseBinding} from "@/lib/corporate-lease-contract";

/**
 * Backend-only mirror to a SYNTHETIC Corporate sandbox.
 * Authorization is obtained from Control first; this grants no authority to browser SDKs.
 * Hard guard against accidentally targeting customer production Firestore.
 */
export async function syncCorporatePreviewLease(
 binding:SandboxLeaseBinding,
 allowed:boolean,
 cutoff?:number
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
 const payload=leasePayload(binding,allowed,new Date(),cutoff);
 await getFirestore(app).doc("organizations/"+binding.orgId+"/nixinxControl/access").set({
  ...payload,
  expiresAt:Timestamp.fromDate(payload.expiresAt),
  updatedAt:FieldValue.serverTimestamp()
 },{merge:false});
}
