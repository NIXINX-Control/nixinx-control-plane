"use client";
import {useState,useEffect,useRef} from "react";
import SearchableRecordSelector,{type RecordOption} from "@/components/searchable-record-selector";
import type {User} from "firebase/auth";
import {parseRefundBaseCents} from "@/lib/commercial-refund-policy";
type Payment={paymentIntentId:string;customerId:string;customerName:string|null;chargeId:string;currency:string;captured:number;refunded:number;available:number};
type InvoiceChoice={paymentIntentId:string;invoiceId:string;invoiceNumber:string|null;applicationIds:string[];amount:number;currency:string;date:number};
export default function CommercialRefunds({user}:{user:User}){
 const [id,setId]=useState(""),[payment,setPayment]=useState<Payment|null>(null),[amount,setAmount]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[reconcileId,setReconcileId]=useState("");
 const [reconcileMessage,setReconcileMessage]=useState(""),[creditMessage,setCreditMessage]=useState("");
 const [selectedAcronym,setSelectedAcronym]=useState("");
 const [selectedInvoice,setSelectedInvoice]=useState<InvoiceChoice|null>(null),[reviewing,setReviewing]=useState(false),[technicalOpen,setTechnicalOpen]=useState(false);
 const [fiscal,setFiscal]=useState<{invoiceNumber:string|null;originalSubtotal:number;originalTax:number;originalTotal:number;subtotal:number;tax:number;total:number;available:number;blockers:string[];allocationVerified:boolean}|null>(null);
 const [acronym,setAcronym]=useState(""),[choices,setChoices]=useState<InvoiceChoice[]>([]),[searched,setSearched]=useState(false),[company,setCompany]=useState("");
 const [directory,setDirectory]=useState<RecordOption[]>([]),[directoryCursor,setDirectoryCursor]=useState<string|null>(null),[directoryBusy,setDirectoryBusy]=useState(false),[directoryError,setDirectoryError]=useState("");
 const dirGeneration=useRef(0);
 async function loadDirectory(cursor:string|null=null){
  const gen=++dirGeneration.current;setDirectoryBusy(true);setDirectoryError("");
  try{const r=await call("?"+new URLSearchParams({directory:"1",...(cursor?{cursor}:{})}));
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
  setBusy(true);setCreditMessage("");setCredit(null);
  try{const r=await call("?"+new URLSearchParams({creditPreview:creditRequest.trim(),acronym:creditAcronym.trim().toLowerCase()}));setCredit(r);}catch(e){setCreditMessage((e as Error).message);}finally{setBusy(false);}
 }
 const money=(v:number)=>new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(v/100);
 async function call(query:string){
  const token=await user.getIdToken();
  const r=await fetch("/api/admin/commercial/refunds"+query,{method:"GET",headers:{Authorization:"Bearer "+token},cache:"no-store"});
  const result=await r.json();if(!r.ok)throw Error(result.error||"No disponible");return result;
 }
 async function review(reference=id,commercialAcronym="",invoice:InvoiceChoice|null=null){
  setSelectedInvoice(invoice);setReviewing(true);setFiscal(null);if(invoice)setTechnicalOpen(false);
  setSelectedAcronym(commercialAcronym);
  setBusy(true);setMessage("");setPayment(null);
  try{const p:Payment=await call("?paymentIntentId="+encodeURIComponent(reference.trim()));setPayment(p);setFiscal(null);setAmount("");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);setReviewing(false);}
 }
 async function lookup(){
 if(!directory.some(v=>v.id===acronym))return;
 setBusy(true);setMessage("");setChoices([]);setSearched(false);setSelectedInvoice(null);setSelectedAcronym("");setPayment(null);setFiscal(null);setId("");setCompany("");
 try{const r=await call("?acronym="+encodeURIComponent(acronym.trim().toLowerCase()));setChoices(r.payments);setCompany(r.company||acronym);setSearched(true);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 const cents=parseRefundBaseCents(amount)??0;
 async function previewFiscal(){
  if(!selectedAcronym||!payment||cents<=0)return;
  setBusy(true);setMessage("");setFiscal(null);
  try{const r=await call("?"+new URLSearchParams({fiscalBase:String(cents),acronym:selectedAcronym,paymentIntentId:payment.paymentIntentId}));setFiscal(r);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 async function reconcile(){
  setBusy(true);setReconcileMessage("");
  try{const r=await call("?requestId="+encodeURIComponent(reconcileId.trim()));setReconcileMessage(r.reconciled===false?"Estado de solicitud: "+r.status+" · "+r.requestId+" · Sin nueva emisión.":"Conciliado con Stripe: "+r.status+" · "+r.id+" · "+money(r.amount)+(r.lockRetained?" · Bloqueo conservado":""));setPayment(null);setFiscal(null);setSelectedInvoice(null);setSelectedAcronym("");setAmount("");setMessage("");}catch(e){setReconcileMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="panel commercial-refunds">
 <h3 className="subheading">Reembolsos comerciales · Sandbox</h3>
 <p className="caption">Consulta pagos y calcula posibles devoluciones. La prueba de emisión terminó: aquí no se emiten nuevas devoluciones ni se modifican licencias.</p>
 <h4>1. Buscar el pago del cliente</h4>
 <form onSubmit={e=>{e.preventDefault();void lookup();}}><SearchableRecordSelector {...directoryProps} label="Cliente comercial" value={acronym} disabled={busy} onChange={v=>{setAcronym(v);setChoices([]);setSearched(false);setSelectedInvoice(null);setSelectedAcronym("");setPayment(null);setFiscal(null);setId("");setCompany("");setMessage("");}}/><button className="btn secondary" disabled={busy||!directory.some(v=>v.id===acronym)}>Buscar facturas pagadas</button></form>
 {searched&&<div style={{marginTop:12}}><b>{company}</b>{choices.length===0?<p className="caption">Sin facturas vinculadas elegibles para consulta. Verifica en Stripe o solicita soporte; no repitas el cobro.</p>:choices.map(v=><div className="item" key={v.paymentIntentId}><div style={{minWidth:0,overflowWrap:"anywhere"}}><b>{v.applicationIds.join(", ")}</b><p className="caption">{v.invoiceNumber||"Factura"} · {new Date(v.date).toLocaleDateString("es-CA")} · {money(v.amount)}</p></div><button className="btn secondary" disabled={busy} type="button" onClick={()=>void review(v.paymentIntentId,acronym.trim().toLowerCase(),v)}>{selectedInvoice?.paymentIntentId===v.paymentIntentId?(reviewing?"Consultando…":payment?"Actualizar saldo":"Reintentar"):"Seleccionar"}</button></div>)}</div>}
 {selectedInvoice&&<div className="item"><div><b>Factura seleccionada: {selectedInvoice.invoiceNumber||"Factura"}</b><p className="caption">{selectedInvoice.applicationIds.join(", ")} · {money(selectedInvoice.amount)}</p>{reviewing&&<p role="status" className="caption">Consultando saldo de Stripe…</p>}</div></div>}
 {payment&&<div className="item"><div><b>{payment.customerName||payment.customerId}</b>{!selectedInvoice&&<p className="caption">{payment.paymentIntentId}</p>}<p>Pagado: {money(payment.captured)} · Reembolsado: {money(payment.refunded)} · Disponible: {money(payment.available)}</p>{!selectedAcronym&&<p className="caption">Consulta técnica. Para calcular una devolución, selecciona la factura desde el cliente comercial.</p>}</div></div>}
 {payment&&selectedAcronym&&<form onSubmit={e=>{e.preventDefault();void previewFiscal();}}><h4>2. Calcular una posible devolución</h4><p className="caption">Solo si el cliente solicita un reembolso. Stripe calcula los impuestos; el resultado es una estimación, no una autorización.</p><label className="field">Importe a devolver antes de impuestos (CAD)<input inputMode="decimal" required value={amount} disabled={busy} aria-invalid={amount!==""&&cents===0} aria-describedby="refund-base-hint" onChange={e=>{setAmount(e.target.value);setFiscal(null);}}/></label><p id="refund-base-hint" className={amount!==""&&cents===0?"error":"caption"}>{amount!==""&&cents===0?"Introduce un importe positivo válido, con hasta dos decimales (ej.: .17 o 0.17).":"Importe en CAD; .17 y 0.17 equivalen a 17 centavos."}</p><button className="btn secondary" disabled={busy||cents<=0}>Calcular devolución con impuestos</button>{fiscal&&<div className="item"><div><b>Factura {fiscal.invoiceNumber||"—"}</b><p className="caption">Original: base {money(fiscal.originalSubtotal)} · impuesto {money(fiscal.originalTax)} · total {money(fiscal.originalTotal)}</p><p>Devolución estimada: base {money(fiscal.subtotal)} · impuesto {money(fiscal.tax)} · total {money(fiscal.total)}</p><p>Saldo disponible: {money(fiscal.available)}</p>{fiscal.blockers.map(b=><p className="error" key={b}>{b}</p>)}{fiscal.allocationVerified&&fiscal.blockers.length===0?<p role="status">Cálculo verificado por Stripe. Registra el importe en el expediente.</p>:<p role="status" className="caption">La devolución no está validada. Solicita revisión; no ajustes el importe manualmente.</p>}<p className="caption">No se ha devuelto dinero. La emisión de nuevas devoluciones no está habilitada.</p></div></div>}</form>}
 {message&&<p role="status" style={{overflowWrap:"anywhere"}}>{message}</p>}
 <details style={{marginTop:20}}><summary>Recuperar una devolución anterior (solo si hubo un intento)</summary><form onSubmit={e=>{e.preventDefault();void reconcile();}}><p className="caption">Si una devolución anterior quedó sin confirmación, recupera su resultado con el ID original. Actualiza la auditoría; no devuelve dinero otra vez.</p><label className="field">ID de solicitud original<input required value={reconcileId} disabled={busy} onChange={e=>{setReconcileId(e.target.value);setReconcileMessage("");}}/></label><button className="btn secondary" disabled={busy||!reconcileId.trim()}>Consultar y conciliar</button></form>{reconcileMessage&&<p role="status" style={{overflowWrap:"anywhere"}}>{reconcileMessage}</p>}</details>
 <details open={technicalOpen} style={{marginTop:20}}><summary onClick={e=>{e.preventDefault();setTechnicalOpen(v=>!v);}}>Diagnóstico avanzado (solo soporte autorizado)</summary>
 <form onSubmit={e=>{e.preventDefault();void review();}}><p className="caption">Si no encuentras la factura y tienes la referencia Stripe del pago, consulta su saldo. No permite emitir.</p><label className="field">Referencia de pago Stripe (pi_…)<input required value={id} disabled={busy} onChange={e=>setId(e.target.value)}/></label><button className="btn secondary" disabled={busy}>Consultar pago</button></form>
 <form onSubmit={e=>{e.preventDefault();void previewCredit();}} style={{marginTop:20}}><h4>Revisar desglose de una devolución conciliada</h4><p className="caption">Consulta histórica de impuestos. Para obtener la nota de crédito emitida, abre la factura en Stripe. No emite otra nota.</p><SearchableRecordSelector {...directoryProps} label="Cliente comercial" value={creditAcronym} disabled={busy} onChange={v=>{setCreditAcronym(v);setCredit(null);setCreditMessage("");}}/><label className="field">ID de solicitud del reembolso<input required value={creditRequest} disabled={busy} onChange={e=>{setCreditRequest(e.target.value);setCredit(null);setCreditMessage("");}}/></label><button className="btn secondary" disabled={busy||!creditRequest.trim()||!directory.some(v=>v.id===creditAcronym)}>Consultar desglose histórico</button></form>
 {credit&&<div className="item"><div><b>Factura {credit.invoiceNumber||"—"}</b><p className="caption">Factura original: base {money(credit.originalSubtotal)} · impuesto {money(credit.originalTax)} · total {money(credit.originalTotal)}</p><p>Base: {money(credit.subtotal)} · Impuesto: {money(credit.tax)} · Total: {money(credit.amount)}</p><p className="caption">Previsualización únicamente. Sin emisión.</p></div></div>}
 {creditMessage&&<p role="status" style={{overflowWrap:"anywhere"}}>{creditMessage}</p>}
 </details>
 </section>;
}
