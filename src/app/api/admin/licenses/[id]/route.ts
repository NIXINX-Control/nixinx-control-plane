import {NextRequest} from "next/server";import {adminUser,db,ok,fail,identifier,str,ApiError} from "@/lib/server";import {permittedTransition,Lifecycle} from "@/lib/lifecycle";
export const runtime="nodejs";
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{const actor=await adminUser(req);const id=identifier((await params).id);const body=await req.json();const next=str(body.status,30) as Lifecycle;const reason=str(body.reason,500);const ref=db.collection("licenses").doc(id);const at=new Date().toISOString();await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw new ApiError(404,"License missing");const previous=snap.data()?.status as Lifecycle;if(!permittedTransition(previous,next))throw new ApiError(409,"Invalid status transition");tx.update(ref,{status:next,updatedAt:at});tx.create(db.collection("audit").doc(),{actor,action:"LICENSE_TRANSITION",target:id,previous,next,reason,at})});return ok({id,status:next})}catch(e){return fail(e)}}

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try {
    const actor=await adminUser(req);
    const id=identifier((await params).id);
    const body=await req.json().catch(()=>{throw new ApiError(400,"Invalid JSON")});
    if(!body||typeof body!=="object"||Array.isArray(body)||
      Object.keys(body).some(key=>!["reason","validUntil"].includes(key)))
      throw new ApiError(400,"Invalid request");
    const reason=str(body.reason,500);
    const requestedExpiry=body.validUntil===undefined?undefined:str(body.validUntil,40);
    const ref=db.collection("licenses").doc(id);
    const audit=db.collection("audit").doc();
    const history=ref.collection("terminatedLicenses").doc(audit.id);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw new ApiError(404,"License missing");
      const previous=snap.data()!;
      if(id!==previous.tenantId+"_"+previous.appId)throw new ApiError(409,"License assignment inconsistent");
      if(previous.status!=="terminated")throw new ApiError(409,"Solo puede emitirse un reemplazo para una licencia terminada");

      const now=new Date();
      const at=now.toISOString();
      const validUntil=requestedExpiry??previous.validUntil;
      if(validUntil!==null&&(typeof validUntil!=="string"||
        !Number.isFinite(Date.parse(validUntil))||Date.parse(validUntil)<=now.getTime()))
        throw new ApiError(400,"Indica una fecha de vencimiento futura para la nueva licencia");

      const {tenantId,appId,graceDays,modules}=previous;
      tx.create(history,{license:previous,replacedAt:at,replacedBy:actor,reason});
      tx.set(ref,{
        tenantId,appId,graceDays,modules,validUntil,status:"active",
        suspensionAt:null,createdAt:at,updatedAt:at,replaces:history.id
      });
      tx.create(audit,{
        actor,action:"LICENSE_REISSUED",target:id,previousStatus:"terminated",nextStatus:"active",
        historicalLicense:history.path,effectiveAt:at,reason,at
      });
    });
    return ok({id,status:"active"});
  }catch(error){return fail(error);}
}
