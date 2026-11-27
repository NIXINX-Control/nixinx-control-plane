import test,{after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {randomUUID,createHash} from "node:crypto";
import ts from "typescript";
import {initializeApp,deleteApp,applicationDefault} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";

// Managed mode is deliberately opt-in, local operator only, fixed project.
const managed=process.env.NIXINX_MANAGED_CONCURRENCY==="AUTHORIZE_SYNTHETIC_WRITES";
if(managed){
 if(process.env.CI||process.env.GITHUB_ACTIONS||process.env.FIRESTORE_EMULATOR_HOST||process.env.GOOGLE_CLOUD_PROJECT!=="nixinx-control")throw Error("Managed run requires local operator, exact project and no emulator/CI");
}else if(!["127.0.0.1:8080","localhost:8080"].includes(process.env.FIRESTORE_EMULATOR_HOST??""))throw Error("Local Firestore emulator required; refusing managed database");
const projectId=managed?"nixinx-control":"demo-nixinx-credit-concurrency";
const app=initializeApp(managed?{projectId,credential:applicationDefault()}:{projectId},"native-credit-concurrency");
const db=getFirestore(app);
const compiled=ts.transpileModule(fs.readFileSync(new URL("../../src/lib/commercial-credit-refund-policy.ts",import.meta.url),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {reserveNativeCreditAuthorization,executeNativeCreditOnce,abandonNativeValidatingReservation,reconcileNativeCredit,prepareNativeCreditAuthorization}=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));
const runId=randomUUID().replaceAll("-","");
const actor="nxfixture_"+runId;
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const audits=new Map(),locks=new Map();
function fixture(payment){
 const suffix="nxfixture_"+runId+"_"+randomUUID().replaceAll("-","");
 const intent={invoiceId:"in_"+suffix,lineId:"il_"+suffix,paymentIntentId:"pi_"+suffix,chargeId:"ch_"+suffix,customerId:"cus_"+suffix,requestId:randomUUID(),subtotal:17,tax:2,amount:19,taxRateIds:["txr_fixture"]};
 if(payment){Object.assign(intent,payment,{requestId:randomUUID()});}
 const evidence={intent,acronym:"ci-fixture",orderId:"order_"+intent.paymentIntentId,subscriptionId:"sub_"+intent.paymentIntentId,available:57,refunded:0,blockers:[],allocationVerified:true};
 const approval={requestId:intent.requestId,acronym:evidence.acronym,invoiceId:intent.invoiceId,paymentIntentId:intent.paymentIntentId,subtotal:17,tax:2,amount:19,expectedRefunded:0,confirmed:true,reason:"CI fixture"};
 const audit=db.collection("audit").doc("commercial-refund-"+intent.requestId),lock=db.collection("commercialRefundLocks").doc(intent.paymentIntentId);
 const fingerprint=createHash("sha256").update(prepareNativeCreditAuthorization(actor,approval,evidence).fingerprintPayload).digest("hex");
 const f={intent,evidence,approval,audit,lock,fingerprint};
 audits.set(audit.path,f);locks.set(lock.path,lock);
 return f;
}
// Allocate every test reference before any mutation. No collection-wide scans/deletes.
const first=fixture(),firstOther=fixture(first.intent);
const recovery=fixture(),recoveryOther=fixture(recovery.intent);
const authorized=fixture();
const stale=fixture(),staleOther=fixture(stale.intent);
const refs=[...Array.from(audits.values(),f=>f.audit),...locks.values()];
console.log("TEST_MODE="+(managed?"MANAGED_SYNTHETIC":"EMULATOR")+" PROJECT="+projectId+" RUN="+runId);
console.log("EXACT_FIXTURE_PATHS="+JSON.stringify(refs.map(r=>r.path)));
try{
 const existing=await db.getAll(...refs);
 assert.ok(existing.every(s=>!s.exists),"Fixture collision: refusing all writes and cleanup");
 console.log("PASS: ALL FIXTURE IDS ABSENT BEFORE TEST");
}catch(e){await db.terminate();await deleteApp(app);throw e;}
let activeTests=0;
function acceptanceTest(name,options,fn){return test(name,options,async()=>{activeTests++;try{await fn();}finally{activeTests--;}});}
after(async()=>{
 try{
  assert.equal(activeTests,0,"Unfinished test: refusing cleanup; inspect exact fixture paths");
  // All ownership checks occur before any delete, atomically; refuse foreign records.
  await db.runTransaction(async tx=>{
   const snaps=await tx.getAll(...refs);
   const byPath=new Map(snaps.map(s=>[s.ref.path,s]));
   for(const s of snaps){
    if(!s.exists)continue;
    const row=s.data();
    const f=audits.get(s.ref.path);
    if(f){
     assert.equal(row.actor,actor);assert.equal(row.action,"COMMERCIAL_REFUND");assert.equal(row.environment,"sandbox");
     assert.equal(row.operation,"NATIVE_CREDIT_REFUND_V1");assert.equal(row.requestId,f.intent.requestId);
     assert.equal(row.target,f.intent.paymentIntentId);assert.equal(row.fingerprint,f.fingerprint);
    }else{
     const owner=Array.from(audits.values()).find(v=>v.lock.path===s.ref.path&&v.intent.requestId===row.requestId);
     assert.ok(owner,"Foreign lock: refusing cleanup");
     assert.equal(row.operation,"NATIVE_CREDIT_REFUND_V1");assert.equal(row.fingerprint,owner.fingerprint);
     const audit=byPath.get(owner.audit.path);
     assert.ok(audit?.exists&&audit.get("actor")===actor&&audit.get("fingerprint")===owner.fingerprint,"Unverified lock owner");
    }
   }
   for(const s of snaps)if(s.exists)tx.delete(s.ref);
  });
  const remaining=await db.getAll(...refs);
  assert.ok(remaining.every(s=>!s.exists),"Fixture cleanup readback failed");
  console.log("PASS: OWNED SYNTHETIC FIXTURES REMOVED; EXACT READBACK EMPTY");
 }finally{await db.terminate();await deleteApp(app);}
});
const options={timeout:90000};
acceptanceTest("concurrent distinct and identical requests reserve one payment exclusively",options,async()=>{
 const a=first,b=firstOther;
 const results=await Promise.allSettled([reserveNativeCreditAuthorization(db,actor,a.approval,a.evidence),reserveNativeCreditAuthorization(db,actor,b.approval,b.evidence),reserveNativeCreditAuthorization(db,actor,a.approval,a.evidence)]);
 const winner=results.filter(r=>r.status==="fulfilled"&&r.value.disposition==="RESERVED");
 assert.equal(winner.length,1);
 const [one,two,lock]=await Promise.all([a.audit.get(),b.audit.get(),a.lock.get()]);
 assert.equal(Number(one.exists)+Number(two.exists),1);
 assert.equal(lock.get("requestId"),winner[0].value.requestId);
 const win=one.exists?a:b;
 assert.equal((await reserveNativeCreditAuthorization(db,actor,win.approval,win.evidence)).disposition,"RECONCILE_ONLY");
});
acceptanceTest("recovery fences an in-flight validator and preserves a successor lock",options,async()=>{
 const a=recovery,b=recoveryOther,entered=deferred(),release=deferred();let writes=0;
 const running=executeNativeCreditOnce(db,actor,a.approval,a.evidence,async()=>{entered.resolve();await release.promise;return a.evidence;},async()=>{writes++;});
 const outcome=running.then(v=>({v}),e=>({e}));
 try{
  await Promise.race([entered.promise,outcome.then(()=>{throw Error("validator ended early")})]);
  assert.equal((await abandonNativeValidatingReservation(db,actor,a.approval,"CI interrupted validation")).disposition,"ABANDONED_BEFORE_EXECUTION");
  await reserveNativeCreditAuthorization(db,actor,b.approval,b.evidence);
 }finally{release.resolve();await outcome;}
 assert.ok((await outcome).e);assert.equal(writes,0);
 assert.equal((await a.audit.get()).get("status"),"REJECTED_BEFORE_EXECUTION");
 assert.equal((await a.lock.get()).get("requestId"),b.intent.requestId);
 assert.equal((await abandonNativeValidatingReservation(db,actor,a.approval,"CI replay")).disposition,"ALREADY_REJECTED");
 assert.equal((await a.lock.get()).get("requestId"),b.intent.requestId);
});
acceptanceTest("authorization winning first retains lock on ambiguous transport and rejects replay",options,async()=>{
 const a=authorized,entered=deferred(),release=deferred();let writes=0;
 const running=executeNativeCreditOnce(db,actor,a.approval,a.evidence,async()=>a.evidence,async()=>{writes++;entered.resolve();await release.promise;throw Error("CI simulated timeout");});
 const outcome=running.then(v=>({v}),e=>({e}));
 try{
  await Promise.race([entered.promise,outcome.then(()=>{throw Error("transport ended early")})]);
  await assert.rejects(()=>abandonNativeValidatingReservation(db,actor,a.approval,"CI recovery"),/reconcile only/);
  assert.equal((await executeNativeCreditOnce(db,actor,a.approval,a.evidence,async()=>a.evidence,async()=>{writes++;})).disposition,"RECONCILE_ONLY");
 }finally{release.resolve();await outcome;}
 assert.equal((await outcome).v?.disposition,"RECONCILE_REQUIRED");assert.equal(writes,1);
 assert.equal((await a.audit.get()).get("status"),"AUTHORIZED");assert.equal((await a.lock.get()).get("requestId"),a.intent.requestId);
});
acceptanceTest("stale second approval rejected after first simulated settlement releases lock",options,async()=>{
 const a=stale,b=staleOther;let writes=0;
 assert.equal((await executeNativeCreditOnce(db,actor,a.approval,a.evidence,async()=>a.evidence,async()=>{writes++;})).disposition,"RECONCILE_REQUIRED");
 const x=a.intent;
 const note={object:"credit_note",id:"cn_fixture",livemode:false,invoice:x.invoiceId,customer:x.customerId,currency:"cad",type:"post_payment",total:19,total_excluding_tax:17,lines:{has_more:false,data:[{type:"invoice_line_item",invoice_line_item:x.lineId}]},tax_amounts:[{amount:2,tax_rate:"txr_fixture"}],out_of_band_amount:0,customer_balance_transaction:null,refund:"re_fixture",status:"issued",metadata:{nixinx_request_id:x.requestId,nixinx_owner:"nixinx-commercial-sandbox-v1"}};
 const refund={object:"refund",id:"re_fixture",payment_intent:x.paymentIntentId,charge:x.chargeId,amount:19,currency:"cad",status:"succeeded"};
 const invoice={object:"invoice",livemode:false,id:x.invoiceId,customer:x.customerId,payment_intent:x.paymentIntentId,subscription:a.evidence.subscriptionId,currency:"cad",status:"paid",amount_paid:57};
 const binding={acronym:a.evidence.acronym,orderId:a.evidence.orderId,subscriptionId:a.evidence.subscriptionId,invoiceId:x.invoiceId,paymentIntentId:x.paymentIntentId,chargeId:x.chargeId,customerId:x.customerId,captured:57,refunded:19};
 const read=async path=>{if(path==="invoices/"+x.invoiceId)return invoice;if(path.startsWith("credit_notes?"))return {object:"list",has_more:false,data:[note]};if(path==="credit_notes/"+note.id)return note;if(path==="refunds/"+refund.id)return refund;throw Error("Unexpected simulated read");};
 assert.equal((await reconcileNativeCredit(db,x.requestId,binding,read)).status,"succeeded");
 assert.equal((await a.lock.get()).exists,false);
 await assert.rejects(()=>executeNativeCreditOnce(db,actor,b.approval,b.evidence,async()=>({...b.evidence,available:38,refunded:19,blockers:["history"],allocationVerified:false}),async()=>{writes++;}));
 assert.equal(writes,1);
 assert.equal((await b.audit.get()).get("status"),"REJECTED_BEFORE_EXECUTION");
 assert.equal((await a.lock.get()).exists,false);
 assert.equal((await reconcileNativeCredit(db,x.requestId,binding,read)).status,"succeeded");
});
