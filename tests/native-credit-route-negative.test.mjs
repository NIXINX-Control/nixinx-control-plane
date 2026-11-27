import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

// Exercise the actual route source with sealed in-process IO. No credentials,
// cloud writes or external requests. This supplements, not replaces, the
// managed Firestore concurrency test and live Sandbox credit readbacks.
const root=new URL("../",import.meta.url);
const moduleUrl=source=>"data:text/javascript;base64,"+Buffer.from(source).toString("base64");
const compile=path=>ts.transpileModule(fs.readFileSync(new URL(path,root),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const credit=moduleUrl(compile("src/lib/commercial-credit-refund-policy.ts"));
const policy=moduleUrl(compile("src/lib/commercial-refund-policy.ts"));
const fixtureKey="__nxReadOnlyRouteFixture";
const mock=moduleUrl("const f=globalThis."+fixtureKey+"; export const {staffIdentity,db,ok,fail,ApiError,str}=f;");
const source=compile("src/app/api/admin/commercial/refunds/route.ts").replaceAll('"@/lib/commercial-credit-refund-policy"',JSON.stringify(credit)).replaceAll('"@/lib/commercial-refund-policy"',JSON.stringify(policy)).replaceAll('"@/lib/server"',JSON.stringify(mock));
const id={requestId:"11111111-1111-4111-8111-111111111111",invoiceId:"in_fixture01",lineId:"il_fixture01",paymentIntentId:"pi_fixture01",chargeId:"ch_fixture01",customerId:"cus_fixture01",subscriptionId:"sub_fixture01"};
const approval={requestId:id.requestId,invoiceId:id.invoiceId,paymentIntentId:id.paymentIntentId,acronym:"nxtest",subtotal:17,tax:2,amount:19,expectedRefunded:0,reason:"Acceptance fixture",confirmed:true};
const actor="fixture-superadmin";
const record={action:"COMMERCIAL_REFUND",operation:"NATIVE_CREDIT_REFUND_V1",environment:"sandbox",actor,requestId:id.requestId,target:id.paymentIntentId,invoiceId:id.invoiceId,acronym:"nxtest",reason:approval.reason,amount:19,expectedRefunded:0,status:"STRIPE_RECORDED",stripeStatus:"succeeded",stripeCreditNoteId:"cn_fixture01",stripeRefundId:"re_fixture01",creditIntent:{invoiceId:id.invoiceId,lineId:id.lineId,paymentIntentId:id.paymentIntentId,chargeId:id.chargeId,customerId:id.customerId,requestId:id.requestId,subtotal:17,tax:2,amount:19,taxRateIds:["txr_fixture01"]}};
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
test("server rejects stale Sandbox approval and replays exact settled request without financial or database writes",async()=>{
 const previousFetch=globalThis.fetch,previousKey=process.env.STRIPE_REFUNDS_SECRET_KEY;
 let dbReads=0,dbWrites=0,stripeReads=0,stripeWrites=0,portalReads=0,authorized=true;
 const deny=()=>{dbWrites++;throw Error("Database writes forbidden");};
 const snap=value=>({exists:!!value,data:()=>value,get:key=>value?.[key]});
 const db={collection(name){assert.equal(name,"audit");return {doc(key){return {get:async()=>{dbReads++;return snap(key==="commercial-refund-"+id.requestId?record:undefined)},set:deny,create:deny,update:deny,delete:deny};}};},runTransaction:deny,batch:deny};
 const intent={object:"payment_intent",livemode:false,id:id.paymentIntentId,customer:id.customerId,latest_charge:id.chargeId,status:"succeeded",currency:"cad"};
 const charge={object:"charge",livemode:false,id:id.chargeId,payment_intent:id.paymentIntentId,customer:id.customerId,paid:true,captured:true,disputed:false,currency:"cad",amount_captured:57,amount_refunded:19};
 const customer={object:"customer",livemode:false,id:id.customerId,metadata:{nixinx_owner:"nixinx-commercial-sandbox-v1",nixinx_uid_hash:"a".repeat(64)}};
 const invoice={object:"invoice",livemode:false,id:id.invoiceId,number:"CL9MQZZD-0001",customer:id.customerId,payment_intent:id.paymentIntentId,subscription:id.subscriptionId,status:"paid",currency:"cad",amount_paid:57,total:57,tax:7,total_discount_amounts:[],lines:{has_more:false,data:[{id:id.lineId,currency:"cad",amount:50,tax_amounts:[{amount:7,inclusive:false,tax_rate:"txr_fixture01"}],discount_amounts:[]}]}};
 const note={object:"credit_note",livemode:false,id:"cn_fixture01",invoice:id.invoiceId,status:"issued",type:"post_payment",total:19};
 const preview={object:"credit_note",livemode:false,invoice:id.invoiceId,customer:id.customerId,currency:"cad",type:"post_payment",total:20,total_excluding_tax:17,lines:{has_more:false,data:[{type:"invoice_line_item",invoice_line_item:id.lineId}]},tax_amounts:[{amount:3,tax_rate:"txr_fixture01"}]};
 const req=body=>({headers:new Headers(),json:async()=>body});
 globalThis[fixtureKey]={staffIdentity:async()=>({uid:actor,canEditPrice:authorized}),db,ok:value=>({status:200,value}),fail:e=>({status:e.status??500,error:e.message}),ApiError,str:value=>value};
 process.env.STRIPE_REFUNDS_SECRET_KEY="rk_test_fixture_no_network";
 globalThis.fetch=async(url,opts)=>{
  const u=new URL(url);
  if(u.origin==="https://nixinx.com"){
   assert.equal(u.pathname,"/api/customer-portal/financial-lookup");assert.equal(opts.method,"POST");assert.deepEqual(JSON.parse(opts.body),{acronym:"nxtest"});portalReads++;
   return {ok:true,json:async()=>({payments:[{paymentIntentId:id.paymentIntentId,invoiceId:id.invoiceId,subscriptionId:id.subscriptionId,orderId:"order_fixture",customerId:id.customerId,amount:57,currency:"cad"}]})};
  }
  assert.equal(u.origin,"https://api.stripe.com");
  if(opts.method!=="GET"||opts.body){stripeWrites++;throw Error("Financial writes forbidden");}
  stripeReads++;
  let data;
  switch(u.pathname){
   case "/v1/payment_intents/"+id.paymentIntentId:data=intent;break;
   case "/v1/charges/"+id.chargeId:data=charge;break;
   case "/v1/customers/"+id.customerId:data=customer;break;
   case "/v1/invoices/"+id.invoiceId:data=invoice;break;
   case "/v1/credit_notes":data={object:"list",has_more:false,data:[note]};break;
   case "/v1/credit_notes/preview":data=preview;break;
   default:throw Error("Unexpected read");
  }
  return {ok:true,json:async()=>structuredClone(data)};
 };
 try{
  const {POST}=await import(moduleUrl(source));
  const execute={action:"native-execute",...approval,executionConfirmed:true};
  const replay=await POST(req(execute));
  assert.deepEqual(replay,{status:200,value:{disposition:"EXISTING_REQUEST",requestId:id.requestId,status:"STRIPE_RECORDED",issuanceEnabled:false}});
  assert.equal(stripeReads,0);
  const mismatch=await POST(req({...execute,reason:"Different reason"}));
  assert.equal(mismatch.status,409);assert.equal(stripeReads,0);
  const stale={...execute,requestId:"22222222-2222-4222-8222-222222222222"};
  const denied=await POST(req(stale));
  assert.equal(denied.status,409);assert.match(denied.error,/no elegible; no emitir/);
  assert.equal(stripeReads,6);assert.equal(portalReads,1);
  const readCount=dbReads;
  authorized=false;
  assert.equal((await POST(req(stale))).status,403);
  assert.equal(dbReads,readCount);assert.equal(stripeReads,6);
  assert.equal(dbWrites,0);assert.equal(stripeWrites,0);
 }finally{
  globalThis.fetch=previousFetch;delete globalThis[fixtureKey];
  if(previousKey===undefined)delete process.env.STRIPE_REFUNDS_SECRET_KEY;else process.env.STRIPE_REFUNDS_SECRET_KEY=previousKey;
 }
});
