import {NextRequest} from "next/server";
import {superadminUser,db,ok,fail,ApiError} from "@/lib/server";
import {existingIdPattern} from "@/lib/client-provisioning";
import {parseClientGoogleBinding,restoreClientGoogleBinding,sameBinding,assertProjectOwner,type ClientGoogleBinding} from "@/lib/client-google-binding";
import {discoverDelegatedClient,acquireDelegatedGoogleToken} from "@/lib/client-google-delegation";
import {probeProjectPermissions} from "@/lib/google-permission-preflight";
import {verifyFirebaseSdkConfig,validateSdkRequirements} from "@/lib/firebase-sdk-config";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const code=(e:unknown)=>{const m=e instanceof Error?e.message:"";return /^(GOOGLE|FIREBASE|FIRESTORE|VERCEL)_([A-Z0-9_]{1,100})$/.test(m)?m:"GOOGLE_DISCOVERY_UNVERIFIED"};
function verifyIntake(d:FirebaseFirestore.DocumentData|undefined,tenant:FirebaseFirestore.DocumentData|undefined,id:string){
 if(!d||d.tenantId!==id||d.catalogTenantReused!==true||tenant?.status!=="active"||d.status!=="PRELIMINARY"||d.technicalReady!==false||d.commercialAuthorized!==false||!d.requirements?.requiredResources?.includes("firestore"))throw new ApiError(409,"GOOGLE_INTAKE_NOT_ELIGIBLE");
}
export async function GET(req:NextRequest){
 try{
  await superadminUser(req);
  const id=req.nextUrl.searchParams.get("tenantId")||"";if(!existingIdPattern.test(id))throw new ApiError(400,"GOOGLE_TENANT_INVALID");
  const [s,t]=await Promise.all([db.collection("clientProvisioning").doc(id).get(),db.collection("tenants").doc(id).get()]);
  const d=s.data();verifyIntake(d,t.data(),id);
  return ok({binding:d?.googleBinding??null,inventory:d?.googleInventory??null,permissionPreflight:d?.googlePermissionPreflight??null,sdkVerification:d?.googleSdkVerification??null});
 }catch(e){return fail(e)}
}
export async function POST(req:NextRequest){
 try{
  if(process.env.VERCEL_ENV!=="production")throw new ApiError(409,"GOOGLE_FEDERATION_PRODUCTION_ONLY");
  const actor=await superadminUser(req);
  const raw=await req.text();if(raw.length>4096)throw new ApiError(400,"GOOGLE_REQUEST_INVALID");
  let input;try{input=JSON.parse(raw)}catch{throw new ApiError(400,"GOOGLE_REQUEST_INVALID")}
  const id=input?.tenantId;if(typeof id!=="string"||!existingIdPattern.test(id))throw new ApiError(400,"GOOGLE_TENANT_INVALID");
  const ref=db.collection("clientProvisioning").doc(id),tenantRef=db.collection("tenants").doc(id);
  if(input.action==="bind"){
   if(Object.keys(input).some(k=>!["action","tenantId","binding","ownerAuthorized"].includes(k))||input.ownerAuthorized!==true)throw new ApiError(400,"GOOGLE_OWNER_AUTHORIZATION_REQUIRED");
   const at=new Date().toISOString();
   const result=await db.runTransaction(async tx=>{
    const [s,t]=await Promise.all([tx.get(ref),tx.get(tenantRef)]);const d=s.data();verifyIntake(d,t.data(),id);
    let b:ClientGoogleBinding;try{b=parseClientGoogleBinding(input.binding,id,d!.appId)}catch(e){throw new ApiError(400,code(e))}
    const ownerRef=db.collection("firebaseProjectOwners").doc(b.projectId),owner=await tx.get(ownerRef);
    try{assertProjectOwner(owner.data(),b)}catch(e){throw new ApiError(409,code(e))}
    if(d!.googleBinding){
     if(!sameBinding(restoreClientGoogleBinding(d!.googleBinding,id,d!.appId),b)||!owner.exists)throw new ApiError(409,"GOOGLE_BINDING_CONFLICT");
     return {binding:b,writes:0};
    }
    if(!owner.exists)tx.create(ownerRef,{tenantId:id,projectId:b.projectId,projectNumber:b.projectNumber,createdAt:at});
    tx.update(ref,{googleBinding:b,googleBindingAuthorizedAt:at,googleBindingAuthorizedBy:actor});
    tx.create(db.collection("audit").doc(),{actor,action:"AUTHORIZE_GOOGLE_DISCOVERY_BINDING",target:id,appId:b.appId,at});
    return {binding:b,writes:owner.exists?2:3};
   });
   const actual=(await ref.get()).data();
   if(!actual||!sameBinding(restoreClientGoogleBinding(actual.googleBinding,id,actual.appId),result.binding))throw new ApiError(409,"GOOGLE_BINDING_READBACK_FAILED");
   return ok({...result,status:"BINDING_SAVED",delegationVerified:false});
  }
  if(!["discover","permissions","sdk"].includes(input.action)||Object.keys(input).some(k=>!["action","tenantId"].includes(k)))throw new ApiError(400,"GOOGLE_REQUEST_INVALID");
  const [s,t]=await Promise.all([ref.get(),tenantRef.get()]);const d=s.data();verifyIntake(d,t.data(),id);
  const b=restoreClientGoogleBinding(d!.googleBinding,id,d!.appId);
  if(!d!.googleBindingAuthorizedAt||!d!.googleBindingAuthorizedBy)throw new ApiError(409,"GOOGLE_OWNER_AUTHORIZATION_REQUIRED");
  const ownerRef=db.collection("firebaseProjectOwners").doc(b.projectId),owner=await ownerRef.get();
  if(!owner.exists)throw new ApiError(409,"GOOGLE_PROJECT_OWNERSHIP_CONFLICT");assertProjectOwner(owner.data(),b);
  if(input.action==="permissions"){
   if(d!.googleMetadataDiscoveryVerified!==true||!d!.googleInventory?.verifiedAt)throw new ApiError(409,"GOOGLE_INVENTORY_REQUIRED");
   let result;try{result=await probeProjectPermissions(b.projectNumber,await acquireDelegatedGoogleToken(b,req.headers.get("x-vercel-oidc-token"),process.env.VERCEL_ENV))}catch(e){throw new ApiError(409,code(e))}
   const at=new Date().toISOString(),inventoryAt=d!.googleInventory.verifiedAt;
   await db.runTransaction(async tx=>{
    const [current,tenant,ownership]=await Promise.all([tx.get(ref),tx.get(tenantRef),tx.get(ownerRef)]);
    const x=current.data();verifyIntake(x,tenant.data(),id);
    if(!ownership.exists||!sameBinding(restoreClientGoogleBinding(x!.googleBinding,id,x!.appId),b)||x!.googleInventory?.verifiedAt!==inventoryAt||!x!.googleBindingAuthorizedAt||!x!.googleBindingAuthorizedBy)throw new ApiError(409,"GOOGLE_BINDING_CHANGED");
    assertProjectOwner(ownership.data(),b);
    tx.update(ref,{googlePermissionPreflight:{...result,verifiedAt:at,inventoryAt},googleSdkVerification:null});
    tx.create(db.collection("audit").doc(),{actor,action:"CHECK_GOOGLE_PROJECT_PERMISSIONS",target:id,appId:b.appId,at,status:result.status});
   });
   const actual=(await ref.get()).data()?.googlePermissionPreflight;
   if(actual?.verifiedAt!==at)throw new ApiError(409,"GOOGLE_PERMISSION_READBACK_FAILED");
   return ok({status:result.status,permissionPreflight:actual,technicalReady:false,commercialAuthorized:false});
  }
  if(input.action==="sdk"){
   const inventoryAt=d!.googleInventory?.verifiedAt,pre=d!.googlePermissionPreflight;
   if(d!.googleMetadataDiscoveryVerified!==true||!inventoryAt||pre?.inventoryAt!==inventoryAt||pre.status!=="PROJECT_PERMISSION_PREFLIGHT_PASS"||pre.sdkConfigPermission!==true||!pre.verifiedAt)throw new ApiError(409,"FIREBASE_SDK_PREFLIGHT_REQUIRED");
   const requirements=validateSdkRequirements(d!.requirements?.derivedFirebaseKeys);
   const sourceCommit=d!.requirements?.sourceCommit;
   if(typeof sourceCommit!=="string"||! /^[a-f0-9]{40}$/.test(sourceCommit))throw new ApiError(409,"FIREBASE_SDK_REQUIREMENTS_INVALID");
   const token=await acquireDelegatedGoogleToken(b,req.headers.get("x-vercel-oidc-token"),process.env.VERCEL_ENV);
   const fresh=await probeProjectPermissions(b.projectNumber,token);
   if(fresh.status!=="PROJECT_PERMISSION_PREFLIGHT_PASS"||!fresh.sdkConfigPermission)throw new ApiError(409,"FIREBASE_SDK_PREFLIGHT_REVIEW");
   const result=await verifyFirebaseSdkConfig(b,requirements,token);
   const at=new Date().toISOString(),preflightAt=pre.verifiedAt;
   const evidence={...result,verifiedAt:at,inventoryAt,preflightAt,sourceCommit};
   await db.runTransaction(async tx=>{
    const [current,tenant,ownership]=await Promise.all([tx.get(ref),tx.get(tenantRef),tx.get(ownerRef)]);
    const x=current.data();verifyIntake(x,tenant.data(),id);
    if(!ownership.exists||!sameBinding(restoreClientGoogleBinding(x!.googleBinding,id,x!.appId),b)||!x!.googleBindingAuthorizedAt||!x!.googleBindingAuthorizedBy||x!.googleMetadataDiscoveryVerified!==true||x!.googleInventory?.verifiedAt!==inventoryAt||x!.googlePermissionPreflight?.verifiedAt!==preflightAt||x!.googlePermissionPreflight?.status!=="PROJECT_PERMISSION_PREFLIGHT_PASS"||x!.googlePermissionPreflight?.sdkConfigPermission!==true||x!.requirements?.sourceCommit!==sourceCommit||JSON.stringify(validateSdkRequirements(x!.requirements?.derivedFirebaseKeys))!==JSON.stringify(requirements))throw new ApiError(409,"GOOGLE_BINDING_CHANGED");
    assertProjectOwner(ownership.data(),b);
    tx.update(ref,{googleSdkVerification:evidence});
    tx.create(db.collection("audit").doc(),{actor,action:"VERIFY_FIREBASE_WEB_SDK_CONFIG",target:id,appId:b.appId,at,status:result.status});
   });
   const actual=(await ref.get()).data()?.googleSdkVerification;
   if(actual?.verifiedAt!==at||actual?.projectId!==b.projectId||actual?.webAppId!==b.webAppId||actual?.inventoryAt!==inventoryAt||actual?.preflightAt!==preflightAt||actual?.sourceCommit!==sourceCommit||actual?.valuesPersisted!==false||JSON.stringify(actual?.verifiedKeys)!==JSON.stringify(requirements))throw new ApiError(409,"FIREBASE_SDK_READBACK_FAILED");
   return ok({status:result.status,sdkVerification:evidence,technicalReady:false,commercialAuthorized:false});
  }
  let inventory;try{inventory=await discoverDelegatedClient(b,req.headers.get("x-vercel-oidc-token"),process.env.VERCEL_ENV)}catch(e){throw new ApiError(409,code(e))}
  const at=new Date().toISOString();
  await db.runTransaction(async tx=>{
   const [current,tenant,ownership]=await Promise.all([tx.get(ref),tx.get(tenantRef),tx.get(ownerRef)]);
   const x=current.data();verifyIntake(x,tenant.data(),id);
   if(!ownership.exists||!sameBinding(restoreClientGoogleBinding(x!.googleBinding,id,x!.appId),b))throw new ApiError(409,"GOOGLE_BINDING_CHANGED");
   assertProjectOwner(ownership.data(),b);
   tx.update(ref,{googleInventory:{...inventory,verifiedAt:at},googleMetadataDiscoveryVerified:true,googlePermissionPreflight:null,googleSdkVerification:null});
   tx.create(db.collection("audit").doc(),{actor,action:"VERIFY_GOOGLE_METADATA_DISCOVERY",target:id,appId:b.appId,at});
  });
  const actual=(await ref.get()).data();
  if(actual?.googleInventory?.verifiedAt!==at||actual?.googleMetadataDiscoveryVerified!==true)throw new ApiError(409,"GOOGLE_INVENTORY_READBACK_FAILED");
  return ok({status:"GOOGLE_METADATA_DISCOVERY_VERIFIED",inventory:actual.googleInventory,technicalReady:false,commercialAuthorized:false});
 }catch(e){return fail(e instanceof ApiError?e:new ApiError(409,code(e)))}
}
