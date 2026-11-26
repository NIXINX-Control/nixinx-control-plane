import {NextRequest} from "next/server";
import {createHash} from "node:crypto";
import {staffIdentity,db,ok,fail,ApiError,str} from "@/lib/server";
import {refundablePayment,validRefundAmount} from "@/lib/commercial-refund-policy";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function authorized(req:NextRequest){
 const staff=await staffIdentity(req);
 if(!staff.canEditPrice)throw new ApiError(403,"Commercial refunds require verified superadmin@nixinx.com");
 return staff.uid;
}
async function stripe(path:string,form?:URLSearchParams,key?:string){
 const secret=process.env.STRIPE_REFUNDS_SECRET_KEY;
 if(!secret?.startsWith("rk_test_"))throw new ApiError(503,"Sandbox refund key unavailable");
 const headers:Record<string,string>={Authorization:"Bearer "+secret,"Stripe-Version":"2024-06-20"};
 if(form)headers["Content-Type"]="application/x-www-form-urlencoded";
 if(key)headers["Idempotency-Key"]=key;
 const r=await fetch("https://api.stripe.com/v1/"+path,{method:form?"POST":"GET",headers,body:form,cache:"no-store",signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new ApiError(503,"Stripe operation requires reconciliation");
 const v=await r.json();if(v.object==="list"?(!Array.isArray(v.data)||v.data.some((item:any)=>item.livemode!==false)):v.livemode!==false)throw new ApiError(409,"Live operation rejected");return v;
}
function paymentId(v:unknown){if(typeof v!=="string"||!/^pi_[A-Za-z0-9]{8,100}$/.test(v))throw new ApiError(400,"Invalid payment reference");return v;}
async function review(id:string){
 const intent=await stripe("payment_intents/"+id);
 if(!/^ch_[A-Za-z0-9]+$/.test(intent.latest_charge??"")||!/^cus_[A-Za-z0-9]+$/.test(intent.customer??""))throw new ApiError(409,"Payment not eligible");
 const [charge,customer]=await Promise.all([stripe("charges/"+intent.latest_charge),stripe("customers/"+intent.customer)]);
 let available:number;try{available=refundablePayment(intent,charge,customer);}catch{throw new ApiError(409,"Payment not eligible");}
 return {paymentIntentId:id,customerId:customer.id,customerName:typeof customer.name==="string"?customer.name:null,chargeId:charge.id,currency:"cad",captured:charge.amount_captured,refunded:charge.amount_refunded,available};
}
function requestIdentifier(v:unknown){if(typeof v!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v))throw new ApiError(400,"Invalid refund request reference");return v;}
async function reconcile(requestId:string){
 const ref=db.collection("audit").doc("commercial-refund-"+requestId);
 const snap=await ref.get(),record=snap.data();
 if(!record||record.action!=="COMMERCIAL_REFUND"||record.environment!=="sandbox")throw new ApiError(404,"Refund authorization not found");
 const id=paymentId(record.target),lock=db.collection("commercialRefundLocks").doc(id);
 let refund:any;
 if(record.stripeRefundId){
  if(!/^re_[A-Za-z0-9]+$/.test(record.stripeRefundId))throw new ApiError(409,"Invalid stored refund reference");
  refund=await stripe("refunds/"+record.stripeRefundId);
 }else{
  const page=await stripe("refunds?"+new URLSearchParams({payment_intent:id,limit:"100"}));
  if(page.has_more)throw new ApiError(409,"Refund history requires manual reconciliation");
  const matches=page.data.filter((r:any)=>r.metadata?.nixinx_request_id===requestId);
  if(matches.length!==1)throw new ApiError(409,"No unique Stripe refund found. Authorization remains locked; do not create another request.");
  refund=matches[0];
 }
 if(!/^re_[A-Za-z0-9]+$/.test(refund.id??"")||refund.payment_intent!==id||refund.charge!==record.chargeId||refund.amount!==record.amount||refund.currency!=="cad"||refund.metadata?.nixinx_request_id!==requestId||refund.metadata?.nixinx_owner!=="nixinx-commercial-sandbox-v1"||!["succeeded","pending","requires_action","failed","canceled"].includes(refund.status))throw new ApiError(409,"Refund evidence mismatch");
 await db.runTransaction(async tx=>{
  const [current,active]=await Promise.all([tx.get(ref),tx.get(lock)]);
  if(current.get("fingerprint")!==record.fingerprint||(current.get("stripeRefundId")&&current.get("stripeRefundId")!==refund.id))throw new ApiError(409,"Refund audit conflict");
  if(active.exists&&active.get("requestId")!==requestId&&!["succeeded","failed","canceled"].includes(current.get("stripeStatus")))throw new ApiError(409,"Refund lock mismatch");
  tx.update(ref,{stripeRefundId:refund.id,stripeStatus:refund.status,status:"STRIPE_RECORDED",reconciledAt:new Date().toISOString()});
  if(active.exists&&active.get("requestId")===requestId&&["succeeded","failed","canceled"].includes(refund.status))tx.delete(lock);
 });
 return {id:refund.id,status:refund.status,amount:refund.amount,reconciled:true};
}
export async function GET(req:NextRequest){
 try{await authorized(req);const requestId=req.nextUrl.searchParams.get("requestId");if(requestId)return ok(await reconcile(requestIdentifier(requestId)));return ok(await review(paymentId(req.nextUrl.searchParams.get("paymentIntentId"))));}catch(e){return fail(e);}
}
export async function POST(req:NextRequest){
 try{
 const actor=await authorized(req);const b=await req.json().catch(()=>{throw new ApiError(400,"Invalid JSON")});
 if(!b||typeof b!=="object"||Array.isArray(b)||Object.keys(b).some(k=>!["paymentIntentId","amount","reason","requestId","expectedRefunded","confirmed"].includes(k)))throw new ApiError(400,"Invalid refund request");
 const id=paymentId(b.paymentIntentId),reason=str(b.reason,500);
 if(b.confirmed!==true||typeof b.requestId!=="string"||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(b.requestId))||!Number.isSafeInteger(b.amount)||b.amount<=0||!Number.isSafeInteger(b.expectedRefunded)||b.expectedRefunded<0)throw new ApiError(400,"Invalid refund authorization");
 const fingerprint=createHash("sha256").update(JSON.stringify([actor,id,b.amount,reason,b.expectedRefunded])).digest("hex");
 const ref=db.collection("audit").doc("commercial-refund-"+b.requestId);
 const lock=db.collection("commercialRefundLocks").doc(id);
 const prior=await ref.get();
 if(prior.exists){
  if(prior.get("fingerprint")!==fingerprint)throw new ApiError(409,"Refund request conflict");
  return ok(await reconcile(requestIdentifier(b.requestId)));
 }
 const p=await review(id);
 if(p.refunded!==b.expectedRefunded||!validRefundAmount(b.amount,p.available))throw new ApiError(409,"Refund balance changed; review payment again");
 await db.runTransaction(async tx=>{
  const [old,active]=await Promise.all([tx.get(ref),tx.get(lock)]);
  if(old.exists||active.exists)throw new ApiError(409,"Refund in progress or reconciliation required");
  tx.create(ref,{actor,action:"COMMERCIAL_REFUND",target:id,customerId:p.customerId,chargeId:p.chargeId,amount:b.amount,currency:"cad",reason,fingerprint,status:"AUTHORIZED",environment:"sandbox",at:new Date().toISOString()});
  tx.create(lock,{requestId:b.requestId,at:new Date().toISOString()});
 });
 // Any ambiguous response keeps the lock and audit intent; never retry with a new key.
 const refund=await stripe("refunds",new URLSearchParams({payment_intent:id,amount:String(b.amount),"metadata[nixinx_request_id]":b.requestId,"metadata[nixinx_owner]":"nixinx-commercial-sandbox-v1"}),"nx-refund-"+b.requestId);
 if(!/^re_[A-Za-z0-9]+$/.test(refund.id??"")||refund.payment_intent!==id||refund.charge!==p.chargeId||refund.amount!==b.amount||refund.currency!=="cad"||!["succeeded","pending","requires_action","failed","canceled"].includes(refund.status))throw new ApiError(409,"Refund response requires reconciliation");
 await db.runTransaction(async tx=>{
  const current=await tx.get(lock);if(current.get("requestId")!==b.requestId)throw new ApiError(409,"Refund lock mismatch");
  tx.update(ref,{stripeRefundId:refund.id,stripeStatus:refund.status,status:"STRIPE_RECORDED",completedAt:new Date().toISOString()});
  if(["succeeded","failed","canceled"].includes(refund.status))tx.delete(lock);
 });
 return ok({id:refund.id,status:refund.status,amount:refund.amount});
 }catch(e){return fail(e);}
}
