"use client";
import {useState,useEffect,useRef} from "react";
import SearchableRecordSelector,{type RecordOption} from "@/components/searchable-record-selector";
import type {User} from "firebase/auth";
type Payment={paymentIntentId:string;customerId:string;customerName:string|null;chargeId:string;currency:string;captured:number;refunded:number;available:number};
type InvoiceChoice={paymentIntentId:string;invoiceNumber:string|null;applicationIds:string[];amount:number;currency:string;date:number};
export default function CommercialRefunds({user}:{user:User}){
 const [id,setId]=useState(""),[payment,setPayment]=useState<Payment|null>(null),[amount,setAmount]=useState(""),[reason,setReason]=useState(""),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[requestId,setRequestId]=useState(""),[attempted,setAttempted]=useState(false),[reconcileId,setReconcileId]=useState("");
 const [selectedAcronym,setSelectedAcronym]=useState("");
 const [selectedInvoice,setSelectedInvoice]=useState<InvoiceChoice|null>(null),[reviewing,setReviewing]=useState(false),[technicalOpen,setTechnicalOpen]=useState(false);
 const [fiscal,setFiscal]=useState<{invoiceNumber:string|null;originalSubtotal:number;originalTax:number;originalTotal:number;subtotal:number;tax:number;total:number;available:number;blockers:string[];allocationVerified:boolean}|null>(null);
 const [acronym,setAcronym]=useState(""),[choices,setChoices]=useState<InvoiceChoice[]>([]),[searched,setSearched]=useState(false),[company,setCompany]=useState("");
 const [directory,setDirectory]=useState<RecordOption[]>([]),[directoryCursor,setDirectoryCursor]=useState<string|null>(null),[directoryBusy,setDirectoryBusy]=useState(false),[directoryError,setDirectoryError]=useState("");
 const dirGeneration=useRef(0);
 async function loadDirectory(cursor:string|null=null){
  const gen=++dirGeneration.current;setDirectoryBusy(true);setDirectoryError("");
  try{const r=await call("GET",undefined,"?"+new URLSearchParams({directory:"1",...(cursor?{cursor}:{})}));
   if(gen!==dirGeneration.current)return;
   const rows:RecordOption[]=r.customers.map((v:{acronym:string;company:string})=>({id:v.acronym,name:v.company}));
   setDirectory(prev=>cursor?Array.from(new Map([...prev,...rows].map(x=>[x.id,x])).values()):rows);setDirectoryCursor(r.cursor??null);
  }catch(e){if(gen===dirGeneration.current)setDirectoryError((e as Error).message);}finally{if(gen===dirGeneration.current)setDirectoryBusy(false);}
 }
 useEffect(()=>{void loadDirectory();return()=>{dirGeneration.current++;};},[user.uid]);
 const directoryProps={options:directory,loading:directoryBusy,error:directoryError,hasMore:!!directoryCursor,onMore:()=>{if(directoryCursor)void loadDirectory(directoryCursor);},onReload:()=>void loadDirectory()};
 const [creditAcronym,setCreditAcronym]=useState(""),[creditRequest,setCreditRequest]=useState(""),[credit,setCredit]=useState<{invoiceNumber:string|null;amount:number;subtotal:number;tax:number;originalSubtotal:number;originalTax:number;originalTotal:number}|null>(null);
 async function previewCredit(){
  if(!directory.some(v=>v.id===creditAcronym))return;
  setBusy(true);setMessage("");setCredit(null);
  try{const r=await call("GET",undefined,"?"+new URLSearchParams({creditPreview:creditRequest.trim(),acronym:creditAcronym.trim().toLowerCase()}));setCredit(r);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 const money=(v:number)=>new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(v/100);
 async function call(method:string,body?:unknown,query?:string){
  const token=await user.getIdToken();
  const r=await fetch("/api/admin/commercial/refunds"+(method==="GET"?(query??"?paymentIntentId="+encodeURIComponent(id.trim())):""),{method,headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  const result=await r.json();if(!r.ok)throw Error(result.error||"No disponible");return result;
 }
 async function review(reference=id,commercialAcronym="",invoice:InvoiceChoice|null=null){
  setSelectedInvoice(invoice);setReviewing(true);setFiscal(null);if(invoice)setTechnicalOpen(false);
  setSelectedAcronym(commercialAcronym);
  setBusy(true);setMessage("");setPayment(null);setConfirmed(false);
  try{const p:Payment=await call("GET",undefined,"?paymentIntentId="+encodeURIComponent(reference.trim()));setPayment(p);setFiscal(null);setAmount("");setReason("");setRequestId(crypto.randomUUID());setAttempted(false);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);setReviewing(false);}
 }
 async function lookup(){
 if(!directory.some(v=>v.id===acronym))return;
 setBusy(true);setMessage("");setChoices([]);setSearched(false);setSelectedInvoice(null);setSelectedAcronym("");setPayment(null);setFiscal(null);setConfirmed(false);setId("");setCompany("");
 try{const r=await call("GET",undefined,"?acronym="+encodeURIComponent(acronym.trim().toLowerCase()));setChoices(r.payments);setCompany(r.company||acronym);setSearched(true);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 const cents=/^\d{1,8}(?:\.\d{1,2})?$/.test(amount)?Math.round(Number(amount)*100):0;
 async function previewFiscal(){
  if(!selectedAcronym||!payment||cents<=0)return;
  setBusy(true);setMessage("");setFiscal(null);
  try{const r=await call("GET",undefined,"?"+new URLSearchParams({fiscalBase:String(cents),acronym:selectedAcronym,paymentIntentId:payment.paymentIntentId}));setFiscal(r);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 async function reconcile(){
  setBusy(true);setMessage("");
  try{const r=await call("GET",undefined,"?requestId="+encodeURIComponent(reconcileId.trim()));setMessage("Conciliado con Stripe: "+r.status+" · "+r.id+" · "+money(r.amount));if(reconcileId.trim()===requestId){setPayment(null);setConfirmed(false);}}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="panel"><h3 className="subheading">Reembolsos comerciales · Sandbox</h3><p className="caption">Consulta un Payment Intent de Stripe de NIXINX. No modifica licencias ni instalaciones. No se admiten pagos reales.</p>
 <form onSubmit={e=>{e.preventDefault();void lookup();}}><SearchableRecordSelector {...directoryProps} label="Cliente comercial" value={acronym} disabled={busy||attempted} onChange={v=>{setAcronym(v);setChoices([]);setSearched(false);setSelectedInvoice(null);setSelectedAcronym("");setPayment(null);setFiscal(null);setConfirmed(false);setId("");setCompany("");setMessage("");}}/><button className="btn secondary" disabled={busy||attempted||!directory.some(v=>v.id===acronym)}>Buscar facturas pagadas</button></form>
 {searched&&<div style={{marginTop:12}}><b>{company}</b>{choices.length===0?<p className="caption">Sin facturas vinculadas elegibles para consulta.</p>:choices.map(v=><div className="item" key={v.paymentIntentId}><div style={{minWidth:0,overflowWrap:"anywhere"}}><b>{v.applicationIds.join(", ")}</b><p className="caption">{v.invoiceNumber||"Factura"} · {new Date(v.date).toLocaleDateString("es-CA")} · {money(v.amount)}</p></div><button className="btn secondary" disabled={busy||attempted} type="button" onClick={()=>void review(v.paymentIntentId,acronym.trim().toLowerCase(),v)}>{selectedInvoice?.paymentIntentId===v.paymentIntentId?(reviewing?"Consultando…":payment?"Seleccionada":"Reintentar"):"Seleccionar"}</button></div>)}</div>}
 <details open={technicalOpen} style={{marginTop:16}}><summary onClick={e=>{e.preventDefault();setTechnicalOpen(v=>!v);}}>Consulta técnica por referencia Stripe</summary><form onSubmit={e=>{e.preventDefault();void review();}}> <label className="field">Referencia de pago Stripe (pi_…)<input required value={id} disabled={busy||attempted} onChange={e=>{setId(e.target.value);}}/></label><button className="btn secondary" disabled={busy||attempted}>Consultar pago</button></form></details>
 {payment&&!selectedAcronym&&<p className="caption">Consulta técnica de solo lectura. Para previsualizar un crédito fiscal, selecciona la factura desde el cliente comercial.</p>}
 {selectedInvoice&&<div className="item"><div><b>Factura seleccionada: {selectedInvoice.invoiceNumber||"Factura"}</b><p className="caption">{selectedInvoice.applicationIds.join(", ")} · {money(selectedInvoice.amount)}</p>{reviewing&&<p role="status" className="caption">Consultando saldo de Stripe…</p>}</div></div>}
 {payment&&<div className="item"><div><b>{payment.customerName||payment.customerId}</b>{!selectedInvoice&&<p className="caption">{payment.paymentIntentId}</p>}<p>Pagado: {money(payment.captured)} · Reembolsado: {money(payment.refunded)} · Disponible: {money(payment.available)}</p></div></div>}
 {payment&&selectedAcronym&&<form onSubmit={e=>{e.preventDefault();void previewFiscal();}}><h3 className="subheading">Previsualizar nuevo reembolso facturado · Sandbox</h3><p className="caption">Introduce la base antes de impuestos. Stripe determina el total. La emisión de nota de crédito y la devolución están deshabilitadas hasta completar el flujo fiscal.</p><label className="field">Base CAD antes de impuestos<input inputMode="decimal" required value={amount} disabled={busy} onChange={e=>{setAmount(e.target.value);setFiscal(null);}}/></label><button className="btn secondary" disabled={busy||cents<=0}>Calcular crédito fiscal</button>{fiscal&&<div className="item"><div><b>Factura {fiscal.invoiceNumber||"—"}</b><p className="caption">Original: base {money(fiscal.originalSubtotal)} · impuesto {money(fiscal.originalTax)} · total {money(fiscal.originalTotal)}</p><p>Crédito propuesto: base {money(fiscal.subtotal)} · impuesto {money(fiscal.tax)} · total {money(fiscal.total)}</p><p>Saldo disponible: {money(fiscal.available)}</p>{fiscal.blockers.map(b=><p className="error" key={b}>{b}</p>)}{fiscal.allocationVerified===true&&fiscal.blockers.length===0?<p role="status">Asignación nativa del reembolso verificada por Stripe.</p>:<p role="status" className="caption">Asignación nativa no confirmada. No autorizar emisión.</p>}<p className="caption">Solo consulta. Sin autorización, emisión ni devolución.</p></div></div>}</form>}
 <form onSubmit={e=>{e.preventDefault();void reconcile();}} style={{marginTop:20}}><h3 className="subheading">Conciliar autorización existente</h3><p className="caption">Solo consulta Stripe y actualiza la auditoría. No crea otro reembolso. Usa la referencia de solicitud registrada.</p><label className="field">ID de solicitud<input required value={reconcileId} disabled={busy} onChange={e=>setReconcileId(e.target.value)}/></label><button className="btn secondary" disabled={busy||!reconcileId.trim()}>Consultar y conciliar</button></form>
 <form onSubmit={e=>{e.preventDefault();void previewCredit();}} style={{marginTop:20}}><h3 className="subheading">Previsualizar nota de crédito · Sandbox</h3><p className="caption">Consulta el desglose fiscal de Stripe para un reembolso ya conciliado. No emite nota de crédito, no devuelve dinero.</p><SearchableRecordSelector {...directoryProps} label="Cliente comercial" value={creditAcronym} disabled={busy} onChange={v=>{setCreditAcronym(v);setCredit(null);}}/><label className="field">ID de solicitud del reembolso<input required value={creditRequest} disabled={busy} onChange={e=>{setCreditRequest(e.target.value);setCredit(null);}}/></label><button className="btn secondary" disabled={busy||!directory.some(v=>v.id===creditAcronym)}>Previsualizar</button></form>
 {credit&&<div className="item"><div><b>Factura {credit.invoiceNumber||"—"}</b><p className="caption">Factura original: base {money(credit.originalSubtotal)} · impuesto {money(credit.originalTax)} · total {money(credit.originalTotal)}</p><p>Base: {money(credit.subtotal)} · Impuesto: {money(credit.tax)} · Total: {money(credit.amount)}</p><p className="caption">Previsualización únicamente. Sin emisión.</p></div></div>}
 {message&&<p role="status" style={{overflowWrap:"anywhere"}}>{message}</p>}
 {!payment&&attempted&&<button className="btn secondary" disabled={busy} onClick={()=>{setAttempted(false);setId("");setMessage("");}}>Consultar otro pago</button>}
 </section>;
}
