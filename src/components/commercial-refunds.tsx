"use client";
import {useState} from "react";
import type {User} from "firebase/auth";
type Payment={paymentIntentId:string;customerId:string;customerName:string|null;chargeId:string;currency:string;captured:number;refunded:number;available:number};
export default function CommercialRefunds({user}:{user:User}){
 const [id,setId]=useState(""),[payment,setPayment]=useState<Payment|null>(null),[amount,setAmount]=useState(""),[reason,setReason]=useState(""),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[requestId,setRequestId]=useState(""),[attempted,setAttempted]=useState(false);
 const money=(v:number)=>new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(v/100);
 async function call(method:string,body?:unknown){
  const token=await user.getIdToken();
  const r=await fetch("/api/admin/commercial/refunds"+(method==="GET"?"?paymentIntentId="+encodeURIComponent(id.trim()):""),{method,headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  const result=await r.json();if(!r.ok)throw Error(result.error||"No disponible");return result;
 }
 async function review(){
  setBusy(true);setMessage("");setPayment(null);setConfirmed(false);
  try{const p:Payment=await call("GET");setPayment(p);setAmount((p.available/100).toFixed(2));setReason("");setRequestId(crypto.randomUUID());setAttempted(false);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 const cents=/^\d{1,8}(?:\.\d{1,2})?$/.test(amount)?Math.round(Number(amount)*100):0;
 async function submit(){
  if(!payment||!confirmed||!requestId||!reason.trim()||cents<=0||cents>payment.available)return;
  setBusy(true);setAttempted(true);setMessage("");
  try{const r=await call("POST",{paymentIntentId:payment.paymentIntentId,amount:cents,reason,requestId,expectedRefunded:payment.refunded,confirmed:true});setMessage("Stripe: "+r.status+" · "+r.id+" · "+money(r.amount));setPayment(null);setConfirmed(false);}catch(e){setMessage((e as Error).message+" · Solicitud "+requestId+". No generes una nueva solicitud si el resultado es incierto.");}finally{setBusy(false);}
 }
 return <section className="panel"><h3 className="subheading">Reembolsos comerciales · Sandbox</h3><p className="caption">Consulta un Payment Intent de Stripe de NIXINX. No modifica licencias ni instalaciones. No se admiten pagos reales.</p>
 <form onSubmit={e=>{e.preventDefault();void review();}}><label className="field">Referencia de pago Stripe (pi_…)<input required value={id} disabled={busy||attempted} onChange={e=>{setId(e.target.value);setPayment(null);setConfirmed(false);}}/></label><button className="btn secondary" disabled={busy||attempted}>Consultar pago</button></form>
 {payment&&<form onSubmit={e=>{e.preventDefault();void submit();}}><div className="item"><div><b>{payment.customerName||payment.customerId}</b><p className="caption">{payment.paymentIntentId}</p><p>Pagado: {money(payment.captured)} · Reembolsado: {money(payment.refunded)} · Disponible: {money(payment.available)}</p></div></div><label className="field">Importe CAD<input inputMode="decimal" required value={amount} disabled={busy||attempted} onChange={e=>{setAmount(e.target.value);setConfirmed(false);}}/></label><label className="field">Motivo obligatorio<textarea required maxLength={500} disabled={busy||attempted} value={reason} onChange={e=>{setReason(e.target.value);setConfirmed(false);}}/></label><label style={{display:"flex",gap:10,alignItems:"center",margin:"14px 0"}}><input type="checkbox" checked={confirmed} disabled={busy||attempted} onChange={e=>setConfirmed(e.target.checked)}/>Autorizo el reembolso de prueba de {money(cents)}.</label><button className="btn" disabled={busy||!confirmed||!reason.trim()||cents<=0||cents>payment.available}>{attempted?"Consultar resultado de la misma solicitud":"Ejecutar reembolso de prueba"}</button></form>}
 {message&&<p role="status" style={{overflowWrap:"anywhere"}}>{message}</p>}
 {!payment&&attempted&&<button className="btn secondary" disabled={busy} onClick={()=>{setAttempted(false);setId("");setMessage("");}}>Consultar otro pago</button>}
 </section>;
}
