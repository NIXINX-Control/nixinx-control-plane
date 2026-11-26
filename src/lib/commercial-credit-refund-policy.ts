import {createHash} from "node:crypto";
import type {Firestore} from "firebase-admin/firestore";
// Stripe is the fiscal authority. All monetary values are integer CAD cents.
export type NativeCreditIntent={invoiceId:string;lineId:string;paymentIntentId:string;chargeId:string;customerId:string;requestId:string;subtotal:number;tax:number;amount:number;taxRateIds:string[]};
const id=(v:unknown,prefix:string):v is string=>typeof v==="string"&&v.startsWith(prefix)&&/^[A-Za-z0-9_]+$/.test(v);
const cents=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
function ensure(condition:unknown,message:string):asserts condition{if(!condition)throw Error(message);}
export function validateNativeCreditIntent(x:NativeCreditIntent){
 ensure(id(x.invoiceId,"in_")&&id(x.lineId,"il_")&&id(x.paymentIntentId,"pi_")&&id(x.chargeId,"ch_")&&id(x.customerId,"cus_"),"Invalid credit identity");
 ensure(typeof x.requestId==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x.requestId),"Invalid credit request");
 ensure(cents(x.subtotal)&&x.subtotal>0&&cents(x.tax)&&cents(x.amount)&&x.amount>0&&x.subtotal+x.tax===x.amount,"Invalid approved fiscal split");
 ensure(Array.isArray(x.taxRateIds)&&x.taxRateIds.every(v=>id(v,"txr_"))&&new Set(x.taxRateIds).size===x.taxRateIds.length,"Invalid original tax references");
}
export function nativeCreditForm(x:NativeCreditIntent){
 validateNativeCreditIntent(x);
 // Never combine refund_amount with an existing refund or customer balance credit.
 return new URLSearchParams({invoice:x.invoiceId,"lines[0][type]":"invoice_line_item","lines[0][invoice_line_item]":x.lineId,"lines[0][amount]":String(x.subtotal),refund_amount:String(x.amount),email_type:"none","metadata[nixinx_request_id]":x.requestId,"metadata[nixinx_owner]":"nixinx-commercial-sandbox-v1"});
}
function fiscalEvidence(note:any,x:NativeCreditIntent){
 validateNativeCreditIntent(x);
 ensure(note?.object==="credit_note"&&note.livemode===false&&note.invoice===x.invoiceId&&note.customer===x.customerId&&note.currency==="cad"&&note.type==="post_payment","Credit identity mismatch");
 ensure(note.total===x.amount&&note.total_excluding_tax===x.subtotal,"Credit fiscal total mismatch");
 ensure(note.lines?.has_more===false&&Array.isArray(note.lines.data)&&note.lines.data.length===1&&note.lines.data[0].type==="invoice_line_item"&&note.lines.data[0].invoice_line_item===x.lineId,"Credit line mismatch");
 ensure(Array.isArray(note.tax_amounts)&&note.tax_amounts.every((t:any)=>cents(t.amount)&&x.taxRateIds.includes(t.tax_rate))&&note.tax_amounts.reduce((sum:number,t:any)=>sum+t.amount,0)===x.tax,"Credit tax mismatch");
 ensure((note.out_of_band_amount??0)===0&&note.customer_balance_transaction===null,"Unexpected credit allocation");
}
export function validateAllocatedCreditPreview(note:any,x:NativeCreditIntent){
 fiscalEvidence(note,x);
 // Preview must never claim an existing refund. Actual issuance is separately authorized.
 ensure(note.refund===null,"Unexpected preview refund reference");
}
export function validateIssuedCredit(note:any,refund:any,x:NativeCreditIntent){
 fiscalEvidence(note,x);
 ensure(id(note.id,"cn_")&&note.status==="issued"&&note.metadata?.nixinx_request_id===x.requestId&&note.metadata?.nixinx_owner==="nixinx-commercial-sandbox-v1","Credit issuance evidence mismatch");
 ensure(id(note.refund,"re_")&&refund?.object==="refund"&&refund.id===note.refund&&refund.payment_intent===x.paymentIntentId&&refund.charge===x.chargeId&&refund.amount===x.amount&&refund.currency==="cad"&&(refund.livemode===undefined||refund.livemode===false),"Credit refund evidence mismatch");
 ensure(["succeeded","pending","requires_action","failed","canceled"].includes(refund.status),"Unknown refund status");
 return {creditNoteId:note.id,refundId:refund.id,status:refund.status,amount:x.amount};
}

/** Immutable authorization candidate. This does not reserve funds or issue Stripe mutations. */
export type NativeCreditApproval={
 requestId:string; acronym:string; invoiceId:string; paymentIntentId:string;
 subtotal:number; tax:number; amount:number; expectedRefunded:number; confirmed:boolean; reason:string;
};
export type NativeCreditEvidence={
 intent:NativeCreditIntent; acronym:string; orderId:string; subscriptionId:string;
 available:number; refunded:number; blockers:string[]; allocationVerified:boolean;
};
export function prepareNativeCreditAuthorization(actor:string,approval:NativeCreditApproval,evidence:NativeCreditEvidence){
 const x=evidence.intent;validateNativeCreditIntent(x);
 ensure(typeof actor==="string"&&actor.trim().length>0&&actor.length<=200,"Invalid authorized actor");
 ensure(approval?.confirmed===true&&typeof approval.reason==="string"&&approval.reason.trim().length>0&&approval.reason.length<=500,"Explicit authorization and reason required");
 ensure(typeof evidence.acronym==="string"&&/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(evidence.acronym)&&typeof evidence.orderId==="string"&&evidence.orderId.length>0&&evidence.orderId.length<=200&&id(evidence.subscriptionId,"sub_"),"Invalid commercial binding");
 ensure(approval.requestId===x.requestId&&approval.acronym===evidence.acronym&&approval.invoiceId===x.invoiceId&&approval.paymentIntentId===x.paymentIntentId,"Approved identity mismatch");
 ensure(approval.subtotal===x.subtotal&&approval.tax===x.tax&&approval.amount===x.amount,"Approved fiscal amount changed");
 ensure(cents(evidence.available)&&evidence.refunded===0&&approval.expectedRefunded===0&&x.amount<=evidence.available,"Payment balance or refund history changed");
 ensure(evidence.allocationVerified===true&&Array.isArray(evidence.blockers)&&evidence.blockers.length===0,"Native allocation not verified");
 const reason=approval.reason.trim();
 const intent={...x,taxRateIds:[...x.taxRateIds].sort()};
 const binding={acronym:evidence.acronym,orderId:evidence.orderId,subscriptionId:evidence.subscriptionId};
 // Use the existing audit and payment lock. The caller must hash this canonical
 // payload, reserve transactionally, and revalidate before any future execution.
 const fingerprintPayload=JSON.stringify(["native-credit-v1",actor,reason,binding.acronym,binding.orderId,binding.subscriptionId,intent.invoiceId,intent.lineId,intent.paymentIntentId,intent.chargeId,intent.customerId,intent.requestId,intent.subtotal,intent.tax,intent.amount,intent.taxRateIds,approval.expectedRefunded,evidence.available]);
 return {operation:"NATIVE_CREDIT_REFUND_V1" as const,environment:"sandbox" as const,actor,reason,target:intent.paymentIntentId,amount:intent.amount,expectedRefunded:approval.expectedRefunded,binding,intent,fingerprintPayload};
}

/** Server-side only. Reserve in existing audit and payment lock atomically.
 * The caller must authenticate the actor and fetch fresh Stripe evidence before
 * calling; a reservation never authorizes a Stripe write by itself.
 * Existing reservations are reconciliation-only; never send a new mutation on replay.
 */
export async function reserveNativeCreditAuthorization(db:Firestore,actor:string,approval:NativeCreditApproval,evidence:NativeCreditEvidence){
 const candidate=prepareNativeCreditAuthorization(actor,approval,evidence);
 const {intent,binding}=candidate;
 const fingerprint=createHash("sha256").update(candidate.fingerprintPayload).digest("hex");
 const ref=db.collection("audit").doc("commercial-refund-"+intent.requestId);
 const lock=db.collection("commercialRefundLocks").doc(intent.paymentIntentId);
 const at=new Date().toISOString();
 return db.runTransaction(async tx=>{
  const [old,active]=await Promise.all([tx.get(ref),tx.get(lock)]);
  if(old.exists){
   ensure(old.get("action")==="COMMERCIAL_REFUND"&&old.get("operation")===candidate.operation&&old.get("environment")==="sandbox"&&old.get("fingerprint")===fingerprint&&old.get("target")===intent.paymentIntentId&&old.get("requestId")===intent.requestId,"Refund authorization conflict");
   // No lock can be recreated or reassigned on replay, even after a crash.
   if(old.get("status")==="VALIDATING"||old.get("status")==="AUTHORIZED"){
    ensure(active.exists&&active.get("requestId")===intent.requestId&&active.get("fingerprint")===fingerprint&&active.get("operation")===candidate.operation,"Refund lock mismatch");
   }
   return {disposition:"RECONCILE_ONLY" as const,requestId:intent.requestId,fingerprint};
  }
  ensure(!active.exists,"Refund in progress or reconciliation required");
  tx.create(ref,{actor:candidate.actor,action:"COMMERCIAL_REFUND",operation:candidate.operation,target:candidate.target,requestId:intent.requestId,customerId:intent.customerId,chargeId:intent.chargeId,amount:intent.amount,currency:"cad",reason:candidate.reason,fingerprint,status:"VALIDATING",environment:"sandbox",at,expectedRefunded:candidate.expectedRefunded,acronym:binding.acronym,orderId:binding.orderId,subscriptionId:binding.subscriptionId,invoiceId:intent.invoiceId,creditIntent:intent});
  tx.create(lock,{requestId:intent.requestId,operation:candidate.operation,fingerprint,at});
  return {disposition:"RESERVED" as const,requestId:intent.requestId,fingerprint};
 });
}

/** Independently refreshed server-side payment and commercial binding evidence. */
export type NativeCreditReconcileBinding={acronym:string;orderId:string;subscriptionId:string;invoiceId:string;paymentIntentId:string;chargeId:string;customerId:string;captured:number;refunded:number};
type StripeRead=(path:string)=>Promise<any>;
/** Reconciliation only: no Stripe POST, no retry of an uncertain issuance.
 * A future authenticated caller must supply fresh review/boundPayment evidence.
 * Failed/canceled refunds retain the lock because the fiscal note may still exist.
 */
export async function reconcileNativeCredit(db:Firestore,requestId:string,binding:NativeCreditReconcileBinding,stripeRead:StripeRead){
 ensure(typeof requestId==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(requestId),"Invalid credit request");
 const ref=db.collection("audit").doc("commercial-refund-"+requestId);
 const lock=db.collection("commercialRefundLocks").doc(binding.paymentIntentId);
 const snapshot=await db.runTransaction(async tx=>{
  const [record,active]=await Promise.all([tx.get(ref),tx.get(lock)]);
  ensure(record.exists&&record.get("action")==="COMMERCIAL_REFUND"&&record.get("operation")==="NATIVE_CREDIT_REFUND_V1"&&record.get("environment")==="sandbox"&&record.get("requestId")===requestId,"Native authorization not found");
  const x=record.get("creditIntent") as NativeCreditIntent;
  ensure(x&&typeof x==="object","Missing credit intent");validateNativeCreditIntent(x);
  const fingerprint=record.get("fingerprint");
  ensure(typeof fingerprint==="string"&&/^[a-f0-9]{64}$/.test(fingerprint)&&x.requestId===requestId&&x.paymentIntentId===binding.paymentIntentId&&x.chargeId===binding.chargeId&&x.customerId===binding.customerId&&x.invoiceId===binding.invoiceId&&record.get("target")===x.paymentIntentId&&record.get("chargeId")===x.chargeId&&record.get("customerId")===x.customerId&&record.get("invoiceId")===x.invoiceId&&record.get("amount")===x.amount&&record.get("currency")==="cad"&&record.get("acronym")===binding.acronym&&record.get("orderId")===binding.orderId&&record.get("subscriptionId")===binding.subscriptionId,"Native authorization binding mismatch");
  const state=record.get("status"),prior=record.get("stripeStatus");
  ensure(state==="AUTHORIZED"||state==="STRIPE_RECORDED","Native authorization not executable or reconcilable");
  const succeeded=state==="STRIPE_RECORDED"&&prior==="succeeded";
  if(!succeeded)ensure(active.exists&&active.get("requestId")===requestId&&active.get("operation")==="NATIVE_CREDIT_REFUND_V1"&&active.get("fingerprint")===fingerprint,"Native reconciliation lock mismatch");
  return {x,fingerprint,creditNoteId:record.get("stripeCreditNoteId"),refundId:record.get("stripeRefundId")};
 });
 const {x,fingerprint}=snapshot;
 ensure(cents(binding.captured)&&cents(binding.refunded)&&binding.captured>=binding.refunded&&binding.captured>=x.amount,"Invalid payment reconciliation balance");
 const invoice=await stripeRead("invoices/"+x.invoiceId);
 ensure(invoice?.object==="invoice"&&invoice.livemode===false&&invoice.id===x.invoiceId&&invoice.customer===x.customerId&&invoice.payment_intent===x.paymentIntentId&&invoice.subscription===binding.subscriptionId&&invoice.currency==="cad"&&invoice.status==="paid"&&invoice.amount_paid===binding.captured,"Invoice reconciliation mismatch");
 const page=await stripeRead("credit_notes?"+new URLSearchParams({invoice:x.invoiceId,limit:"100"}));
 ensure(page?.object==="list"&&page.has_more===false&&Array.isArray(page.data)&&page.data.every((n:any)=>n?.object==="credit_note"&&n.livemode===false&&n.invoice===x.invoiceId),"Credit history requires reconciliation");
 const matches=page.data.filter((n:any)=>n.metadata?.nixinx_request_id===requestId);
 ensure(matches.length===1&&id(matches[0].id,"cn_"),"No unique Stripe credit note; retain authorization lock");
 const note=await stripeRead("credit_notes/"+matches[0].id);
 ensure(note?.id===matches[0].id&&id(note.refund,"re_"),"Credit refund reference missing");
 const refund=await stripeRead("refunds/"+note.refund);
 const result=validateIssuedCredit(note,refund,x);
 ensure((!snapshot.creditNoteId||snapshot.creditNoteId===result.creditNoteId)&&(!snapshot.refundId||snapshot.refundId===result.refundId),"Stored credit/refund reference conflict");
 // A succeeded refund must be reflected on the independently verified charge;
 // a stale charge read must not release the lock.
 if(result.status==="succeeded")ensure(binding.refunded===x.amount,"Charge refund readback requires reconciliation");
 return db.runTransaction(async tx=>{
  const [record,active]=await Promise.all([tx.get(ref),tx.get(lock)]);
  ensure(record.exists&&record.get("fingerprint")===fingerprint&&record.get("operation")==="NATIVE_CREDIT_REFUND_V1"&&record.get("environment")==="sandbox"&&record.get("requestId")===requestId&&nativeCreditForm(record.get("creditIntent")).toString()===nativeCreditForm(x).toString()&&record.get("creditIntent").paymentIntentId===x.paymentIntentId&&record.get("creditIntent").chargeId===x.chargeId&&record.get("creditIntent").customerId===x.customerId&&record.get("creditIntent").tax===x.tax&&JSON.stringify([...record.get("creditIntent").taxRateIds].sort())===JSON.stringify([...x.taxRateIds].sort()),"Native reconciliation audit conflict");
  ensure((!record.get("stripeCreditNoteId")||record.get("stripeCreditNoteId")===result.creditNoteId)&&(!record.get("stripeRefundId")||record.get("stripeRefundId")===result.refundId),"Native reconciliation reference conflict");
  const status=record.get("status"),prior=record.get("stripeStatus");
  ensure(status==="AUTHORIZED"||status==="STRIPE_RECORDED","Native reconciliation state conflict");
  if(status==="STRIPE_RECORDED"&&["succeeded","failed","canceled"].includes(prior)){
   ensure(prior===result.status,"Native terminal status conflict");
   if(prior==="succeeded")return {...result,reconciled:true,lockRetained:false};
  }
  ensure(active.exists&&active.get("requestId")===requestId&&active.get("operation")==="NATIVE_CREDIT_REFUND_V1"&&active.get("fingerprint")===fingerprint,"Native reconciliation lock mismatch");
  const at=new Date().toISOString();
  tx.update(ref,{status:"STRIPE_RECORDED",stripeCreditNoteId:result.creditNoteId,stripeRefundId:result.refundId,stripeStatus:result.status,reconciledAt:at});
  if(result.status==="succeeded")tx.delete(lock);
  return {...result,reconciled:true,lockRetained:result.status!=="succeeded"};
 });
}
