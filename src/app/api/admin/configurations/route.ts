import {NextRequest} from "next/server";
import {superadminUser,db,ApiError,fail} from "@/lib/server";
import {parseConfiguration,assertConfigurationBinding,assertFirebaseOwnership,ConfigurationError} from "@/lib/tenant-configuration";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function response(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}})}
export async function GET(req:NextRequest){
  try{
    await superadminUser(req);
    const snap=await db.collection("configurations").orderBy("hostname").limit(201).get();
    return response({configurations:snap.docs.slice(0,200).map(doc=>({id:doc.id,...parseConfiguration({
      tenantId:doc.data().tenantId,appId:doc.data().appId,hostname:doc.data().hostname,firebase:doc.data().firebase,orgId:doc.data().orgId
    }),status:doc.data().status})),truncated:snap.size>200});
  }catch(error){return fail(error)}
}
export async function POST(req:NextRequest){
  try{
    const actor=await superadminUser(req);
    const config=parseConfiguration(await req.json().catch(()=>{throw new ApiError(400,"Invalid JSON")}));
    const ref=db.collection("configurations").doc(config.hostname);
    const ownerRef=db.collection("firebaseProjectOwners").doc(config.firebase.projectId);
    const at=new Date().toISOString();
    await db.runTransaction(async tx=>{
      const [tenant,app,prior,owner]=await Promise.all([
        tx.get(db.collection("tenants").doc(config.tenantId)),
        tx.get(db.collection("apps").doc(config.appId)),tx.get(ref),tx.get(ownerRef)
      ]);
      assertConfigurationBinding(config,tenant.data(),app.data(),prior.data());
      assertFirebaseOwnership(config,owner.data());
      if(!owner.exists)tx.create(ownerRef,{tenantId:config.tenantId,projectId:config.firebase.projectId,createdAt:at});
      if(prior.exists){tx.set(ref,{...config,status:"draft",createdAt:prior.data()?.createdAt??at,updatedAt:at});}
      else{tx.create(ref,{...config,status:"draft",createdAt:at,updatedAt:at});}
      tx.create(db.collection("audit").doc(),{actor,action:prior.exists?"UPDATE_CONFIGURATION_DRAFT":"CREATE_CONFIGURATION_DRAFT",target:config.hostname,at});
    });
    return response({hostname:config.hostname,status:"draft"},201);
  }catch(error){
    return error instanceof ConfigurationError?response({error:error.message},400):fail(error);
  }
}
