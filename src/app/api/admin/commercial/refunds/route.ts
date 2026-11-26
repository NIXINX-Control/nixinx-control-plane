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
 const v=await r.json();
 // Stripe Refund objects have no livemode field. Only accept this exception on refund endpoints;
 // the restricted test key and independently verified test Charge/PaymentIntent are the mode evidence.
 const refundEndpoint=path==="refunds"||path.startsWith("refunds/")||path.startsWith("refunds?");
 const validMode=(item:any)=>item?.livemode===false||(refundEndpoint&&item?.object==="refund"&&item.livemode===undefined);
 if(v.object==="list"?(!Array.isArray(v.data)||v.data.some((item:any)=>!validMode(item))):!validMode(v))throw new ApiError(409,"Live operation rejected");return v;
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
 const intent=await stripe("payment_intents/"+id);
 if(intent.id!==id||intent.customer!==record.customerId||intent.latest_charge!==record.chargeId||!/^ch_[A-Za-z0-9]+$/.test(record.chargeId))throw new ApiError(409,"Refund payment evidence mismatch");
 const charge=await stripe("charges/"+record.chargeId);
 if(charge.id!==record.chargeId||charge.payment_intent!==id||charge.customer!==record.customerId||charge.currency!=="cad"||intent.currency!=="cad")throw new ApiError(409,"Refund charge evidence mismatch");
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
async function commercialLookup(req:NextRequest,acronym:string){
 if(!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(acronym))throw new ApiError(400,"Invalid commercial acronym");
 const response=await fetch("https://nixinx.com/api/customer-portal/financial-lookup",{method:"POST",headers:{Authorization:req.headers.get("authorization")||"","Content-Type":"application/json"},body:JSON.stringify({acronym}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new ApiError(503,"Commercial payment lookup unavailable");
 const data=await response.json();if(!Array.isArray(data.payments)||data.payments.length>100)throw new ApiError(503,"Invalid commercial payment lookup");
 return data;
}
async function boundPayment(req:NextRequest,acronym:string,id:string,p:Awaited<ReturnType<typeof review>>){
 const data=await commercialLookup(req,acronym);
 const matches=data.payments.filter((v:any)=>v.paymentIntentId===id);
 if(matches.length!==1)throw new ApiError(409,"Payment is not uniquely bound to a commercial order");
 const v=matches[0];
 if(!/^in_[A-Za-z0-9]+$/.test(v.invoiceId??"")||!/^sub_[A-Za-z0-9]+$/.test(v.subscriptionId??"")||typeof v.orderId!=="string"||!v.orderId||v.orderId.length>200||v.customerId!==p.customerId||v.amount!==p.captured||v.currency!=="cad")throw new ApiError(409,"Commercial invoice binding mismatch");
 return {acronym,invoiceId:v.invoiceId as string,orderId:v.orderId as string,subscriptionId:v.subscriptionId as string};
}
async function creditPreview(req:NextRequest,requestId:string,acronym:string){
 const record=(await db.collection("audit").doc("commercial-refund-"+requestId).get()).data();
 if(!record||record.action!=="COMMERCIAL_REFUND"||record.environment!=="sandbox"||record.status!=="STRIPE_RECORDED"||record.stripeStatus!=="succeeded"||!/^re_[A-Za-z0-9]+$/.test(record.stripeRefundId??""))throw new ApiError(409,"Reconcile a successful existing refund first");
 const id=paymentId(record.target),p=await review(id),binding=await boundPayment(req,acronym,id,p);
 if(p.customerId!==record.customerId||p.chargeId!==record.chargeId||!Number.isSafeInteger(record.amount)||record.amount<=0||p.refunded<record.amount||(record.acronym&&record.acronym!==acronym)||(record.invoiceId&&record.invoiceId!==binding.invoiceId)||(record.orderId&&record.orderId!==binding.orderId)||(record.subscriptionId&&record.subscriptionId!==binding.subscriptionId))throw new ApiError(409,"Existing refund binding mismatch");
 const [invoice,refund,notes]=await Promise.all([stripe("invoices/"+binding.invoiceId),stripe("refunds/"+record.stripeRefundId),stripe("credit_notes?"+new URLSearchParams({invoice:binding.invoiceId,limit:"100"}))]);
 if(invoice.object!=="invoice"||invoice.id!==binding.invoiceId||invoice.customer!==p.customerId||invoice.payment_intent!==id||invoice.subscription!==binding.subscriptionId||invoice.status!=="paid"||invoice.currency!=="cad"||invoice.amount_paid!==p.captured)throw new ApiError(409,"Invoice evidence mismatch");
 if(refund.object!=="refund"||refund.id!==record.stripeRefundId||refund.payment_intent!==id||refund.charge!==p.chargeId||refund.status!=="succeeded"||refund.amount!==record.amount||refund.currency!=="cad"||refund.metadata?.nixinx_request_id!==requestId||refund.metadata?.nixinx_owner!=="nixinx-commercial-sandbox-v1")throw new ApiError(409,"Refund evidence mismatch");
 if(notes.has_more||notes.data.some((n:any)=>n.object!=="credit_note"||n.invoice!==invoice.id))throw new ApiError(409,"Credit note history requires reconciliation");
 const existing=notes.data.filter((n:any)=>n.refund===refund.id);
 if(existing.length)throw new ApiError(409,"Existing linked credit note requires reconciliation; do not issue another");
 const preview=await stripe("credit_notes/preview?"+new URLSearchParams({invoice:invoice.id,amount:String(refund.amount),refund:refund.id,email_type:"none"}));
 if(preview.object!=="credit_note"||preview.invoice!==invoice.id||preview.customer!==p.customerId||preview.currency!=="cad"||preview.type!=="post_payment"||preview.total!==refund.amount||!Number.isSafeInteger(preview.total_excluding_tax)||preview.total_excluding_tax<0||preview.total_excluding_tax>preview.total||!Array.isArray(preview.tax_amounts)||preview.tax_amounts.some((t:any)=>!Number.isSafeInteger(t.amount)||t.amount<0)||preview.tax_amounts.reduce((sum:number,t:any)=>sum+t.amount,0)!==preview.total-preview.total_excluding_tax)throw new ApiError(409,"Stripe preview does not reconcile with existing refund and tax");
 if(preview.refund!==null&&preview.refund!==refund.id)throw new ApiError(409,"Preview refund reference mismatch");
 if((preview.out_of_band_amount??0)!==0||preview.customer_balance_transaction)throw new ApiError(409,"Unexpected credit allocation");
 return {requestId,invoiceNumber:invoice.number??null,currency:"cad",amount:preview.total,subtotal:preview.total_excluding_tax,tax:preview.total-preview.total_excluding_tax,refundId:refund.id,mode:"preview_only"};
}
export async function GET(req:NextRequest){
 try{await authorized(req);const creditRequest=req.nextUrl.searchParams.get("creditPreview");if(creditRequest!==null)return ok(await creditPreview(req,requestIdentifier(creditRequest),req.nextUrl.searchParams.get("acronym")??""));const acronym=req.nextUrl.searchParams.get("acronym");if(acronym!==null){
 return ok(await commercialLookup(req,acronym));
 }const requestId=req.nextUrl.searchParams.get("requestId");if(requestId)return ok(await reconcile(requestIdentifier(requestId)));return ok(await review(paymentId(req.nextUrl.searchParams.get("paymentIntentId"))));}catch(e){return fail(e);}
}
export async function POST(req:NextRequest){
 try{
 const actor=await authorized(req);const b=await req.json().catch(()=>{throw new ApiError(400,"Invalid JSON")});
 if(!b||typeof b!=="object"||Array.isArray(b)||Object.keys(b).some(k=>!["paymentIntentId","amount","reason","requestId","expectedRefunded","confirmed","acronym"].includes(k)))throw new ApiError(400,"Invalid refund request");
 const id=paymentId(b.paymentIntentId),reason=str(b.reason,500);
 if(b.confirmed!==true||typeof b.requestId!=="string"||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(b.requestId))||!Number.isSafeInteger(b.amount)||b.amount<=0||!Number.isSafeInteger(b.expectedRefunded)||b.expectedRefunded<0)throw new ApiError(400,"Invalid refund authorization");
 const fingerprint=createHash("sha256").update(JSON.stringify([actor,id,b.amount,reason,b.expectedRefunded])).digest("hex");
 const ref=db.collection("audit").doc("commercial-refund-"+b.requestId);
 const lock=db.collection("commercialRefundLocks").doc(id);
 const prior=await ref.get();
 if(prior.exists){
  if(prior.get("fingerprint")!==fingerprint)throw new ApiError(409,"Refund request conflict");
  if(prior.get("status")==="REJECTED_BEFORE_EXECUTION")throw new ApiError(409,"Authorization rejected before execution; review payment again");
  return ok(await reconcile(requestIdentifier(b.requestId)));
 }
 const p=await review(id);
 const binding=await boundPayment(req,typeof b.acronym==="string"?b.acronym:"",id,p);
 if(p.refunded!==b.expectedRefunded||!validRefundAmount(b.amount,p.available))throw new ApiError(409,"Refund balance changed; review payment again");
 await db.runTransaction(async tx=>{
  const [old,active]=await Promise.all([tx.get(ref),tx.get(lock)]);
  if(old.exists||active.exists)throw new ApiError(409,"Refund in progress or reconciliation required");
  tx.create(ref,{actor,action:"COMMERCIAL_REFUND",target:id,customerId:p.customerId,chargeId:p.chargeId,...binding,amount:b.amount,currency:"cad",reason,fingerprint,status:"VALIDATING",environment:"sandbox",at:new Date().toISOString()});
  tx.create(lock,{requestId:b.requestId,at:new Date().toISOString()});
 });
 // Re-read under the durable lock: a competing refund may have completed after the first review.
 let latest:Awaited<ReturnType<typeof review>>;
 try{
  latest=await review(id);
  const currentBinding=await boundPayment(req,binding.acronym,id,latest);
  if(JSON.stringify(currentBinding)!==JSON.stringify(binding))throw new ApiError(409,"Commercial binding changed");
  if(latest.chargeId!==p.chargeId||latest.customerId!==p.customerId||latest.refunded!==b.expectedRefunded||!validRefundAmount(b.amount,latest.available))throw new ApiError(409,"Refund balance changed; review payment again");
 }catch(error){
  // No Stripe mutation has been attempted. Release only our own validation lock.
  await db.runTransaction(async tx=>{
   const [current,active]=await Promise.all([tx.get(ref),tx.get(lock)]);
   if(current.get("status")!=="VALIDATING"||active.get("requestId")!==b.requestId)throw new ApiError(409,"Refund validation lock mismatch");
   tx.update(ref,{status:"REJECTED_BEFORE_EXECUTION",completedAt:new Date().toISOString()});tx.delete(lock);
  });
  throw error;
 }
 await db.runTransaction(async tx=>{
  const [current,active]=await Promise.all([tx.get(ref),tx.get(lock)]);
  if(current.get("status")!=="VALIDATING"||active.get("requestId")!==b.requestId)throw new ApiError(409,"Refund validation lock mismatch");
  tx.update(ref,{status:"AUTHORIZED",authorizedAt:new Date().toISOString()});
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
