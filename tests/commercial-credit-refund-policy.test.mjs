import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const compiled=ts.transpileModule(fs.readFileSync(new URL("../src/lib/commercial-credit-refund-policy.ts",import.meta.url),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {nativeCreditForm,validateAllocatedCreditPreview,validateIssuedCredit,prepareNativeCreditAuthorization}=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));
const intent={invoiceId:"in_fixture",lineId:"il_fixture",paymentIntentId:"pi_fixture",chargeId:"ch_fixture",customerId:"cus_fixture",requestId:"11111111-1111-4111-8111-111111111111",subtotal:17,tax:2,amount:19,taxRateIds:["txr_fixture"]};
const preview={object:"credit_note",livemode:false,invoice:intent.invoiceId,customer:intent.customerId,currency:"cad",type:"post_payment",total:19,total_excluding_tax:17,lines:{has_more:false,data:[{type:"invoice_line_item",invoice_line_item:intent.lineId}]},tax_amounts:[{amount:2,tax_rate:"txr_fixture"}],out_of_band_amount:0,customer_balance_transaction:null,refund:null};
const issued={...preview,id:"cn_fixture",status:"issued",refund:"re_fixture",metadata:{nixinx_request_id:intent.requestId,nixinx_owner:"nixinx-commercial-sandbox-v1"}};
const refund={object:"refund",id:"re_fixture",payment_intent:intent.paymentIntentId,charge:intent.chargeId,amount:19,currency:"cad",status:"succeeded"};
test("native form uses only new Stripe refund allocation; preserves exact approved total",()=>{
 const form=nativeCreditForm(intent);assert.equal(form.get("refund_amount"),"19");assert.equal(form.get("lines[0][amount]"),"17");assert.equal(form.has("refund"),false);assert.equal(form.has("credit_amount"),false);assert.equal(form.has("out_of_band_amount"),false);
 assert.throws(()=>nativeCreditForm({...intent,amount:20}));assert.throws(()=>nativeCreditForm({...intent,tax:-1}));assert.throws(()=>nativeCreditForm({...intent,subtotal:0,amount:2}));
});
test("allocated preview fails closed for tax, total, identity, other allocation and existing refund",()=>{
 validateAllocatedCreditPreview(preview,intent);
 for(const changes of [{total:20},{total_excluding_tax:18},{livemode:true},{customer:"cus_other"},{currency:"usd"},{refund:"re_other"},{out_of_band_amount:1},{customer_balance_transaction:"cbtxn_other"},{tax_amounts:[{amount:2,tax_rate:"txr_other"}]},{lines:{has_more:true,data:[]}}])assert.throws(()=>validateAllocatedCreditPreview({...preview,...changes},intent));
});
test("native issued note independently binds refund to invoice charge and approved total",()=>{
 assert.equal(validateIssuedCredit(issued,refund,intent).status,"succeeded");
 assert.equal(validateIssuedCredit(issued,{...refund,status:"pending"},intent).status,"pending");
 for(const changes of [{id:"re_other"},{charge:"ch_other"},{amount:20},{livemode:true},{status:"unknown"}])assert.throws(()=>validateIssuedCredit(issued,{...refund,...changes},intent));
 assert.throws(()=>validateIssuedCredit({...issued,metadata:{}},refund,intent));assert.throws(()=>validateIssuedCredit({...issued,status:"void"},refund,intent));
});

const evidence={intent,acronym:"nxtest",orderId:"order_fixture",subscriptionId:"sub_fixture",available:57,refunded:0,blockers:[],allocationVerified:true};
const approval={requestId:intent.requestId,acronym:evidence.acronym,invoiceId:intent.invoiceId,paymentIntentId:intent.paymentIntentId,subtotal:17,tax:2,amount:19,expectedRefunded:0,confirmed:true,reason:"Approved fixture"};
test("native authorization binds actor, commercial identity, approved fiscal cents and request",()=>{
 const a=prepareNativeCreditAuthorization("staff_fixture",approval,evidence);
 assert.equal(a.operation,"NATIVE_CREDIT_REFUND_V1");assert.equal(a.environment,"sandbox");assert.equal(a.amount,19);assert.equal(a.target,intent.paymentIntentId);
 assert.equal(a.fingerprintPayload,prepareNativeCreditAuthorization("staff_fixture",{...approval},evidence).fingerprintPayload);
 assert.notEqual(a.fingerprintPayload,prepareNativeCreditAuthorization("other_staff",approval,evidence).fingerprintPayload);
 assert.notEqual(a.fingerprintPayload,prepareNativeCreditAuthorization("staff_fixture",{...approval,reason:"Different authorization"},evidence).fingerprintPayload);
});
test("reject tampered approval, changed identity, balance, history or blocked allocation",()=>{
 for(const changes of [{confirmed:false},{reason:" "},{amount:20},{tax:3},{subtotal:18},{acronym:"org"},{invoiceId:"in_other"},{paymentIntentId:"pi_other"},{requestId:"22222222-2222-4222-8222-222222222222"},{expectedRefunded:1}])assert.throws(()=>prepareNativeCreditAuthorization("staff_fixture",{...approval,...changes},evidence));
 for(const changes of [{available:18},{refunded:1},{allocationVerified:false},{blockers:["history"]},{orderId:""},{subscriptionId:"pi_wrong"}])assert.throws(()=>prepareNativeCreditAuthorization("staff_fixture",approval,{...evidence,...changes}));
 assert.throws(()=>prepareNativeCreditAuthorization("",approval,evidence));
});
