"use client";
import {useState,useEffect,useRef} from "react";
import type {User} from "firebase/auth";
type EventRow={id:string;at:string;action:string;target:string;actor:string;reason?:string;status?:string;amount?:number|null;currency?:string|null;stripeStatus?:string|null};
type Filters={q:string;category:string;from:string;to:string};
const initial:Filters={q:"",category:"all",from:"",to:""};
export default function AuditSearch({user}:{user:User}){
 const [draft,setDraft]=useState(initial),[filters,setFilters]=useState(initial),[rows,setRows]=useState<EventRow[]>([]),[next,setNext]=useState<string|null>(null),[history,setHistory]=useState<(string|null)[]>([null]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[scanned,setScanned]=useState(0);
 const generation=useRef(0);
 async function load(f:Filters,cursor:string|null,stack:(string|null)[]){
  const g=++generation.current;setBusy(true);setError("");setRows([]);setNext(null);setScanned(0);
  try{
   const token=await user.getIdToken(),q=new URLSearchParams(f);if(cursor)q.set("cursor",cursor);
   const r=await fetch("/api/admin/audit?"+q,{headers:{Authorization:"Bearer "+token},cache:"no-store"}),v=await r.json();
   if(!r.ok||!Array.isArray(v.items))throw Error(v.error||"No se pudo consultar auditoría");
   if(g!==generation.current)return;setRows(v.items);setNext(v.cursor??null);setScanned(v.scanned??0);setHistory(stack);setFilters(f);
  }catch(e){if(g===generation.current)setError((e as Error).message);}finally{if(g===generation.current)setBusy(false);}
 }
 useEffect(()=>{void load(initial,null,[null]);return()=>{generation.current++;};},[user.uid]);
 function field(k:keyof Filters,v:string){setDraft(p=>({...p,[k]:v}));}
 return <section className="panel"><h3 className="subheading">Eventos auditados</h3><p className="caption">Orden descendente por fecha. Búsqueda por evento, referencia, actor o motivo autorizado. Fechas en UTC.</p>
 <form onSubmit={e=>{e.preventDefault();void load(draft,null,[null]);}} style={{display:"grid",gap:12}}>
 <label className="field">Buscar<input value={draft.q} maxLength={160} placeholder="COMMERCIAL_REFUND, referencia, usuario…" onChange={e=>field("q",e.target.value)}/></label>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,160px),1fr))",gap:10}}>
 <label className="field">Categoría<select value={draft.category} onChange={e=>field("category",e.target.value)}><option value="all">Todas</option><option value="commercial">Facturación</option><option value="licenses">Licencias</option><option value="provisioning">Infraestructura e instalaciones</option><option value="catalog">Catálogos</option><option value="other">Otros</option></select></label>
 <label className="field">Desde (UTC)<input type="date" value={draft.from} onChange={e=>field("from",e.target.value)}/></label>
 <label className="field">Hasta (UTC)<input type="date" value={draft.to} onChange={e=>field("to",e.target.value)}/></label></div>
 <div style={{display:"flex",flexWrap:"wrap",gap:8}}><button className="btn" disabled={busy}>Buscar</button><button type="button" className="btn secondary" disabled={busy} onClick={()=>{setDraft(initial);void load(initial,null,[null]);}}>Limpiar filtros</button></div></form>
 {error&&<p role="alert" className="error">{error}</p>}
 {busy?<p role="status">Consultando…</p>:<><p className="caption">{rows.length} coincidencias en esta página · {scanned} eventos examinados</p>
 {rows.length===0&&!error&&<p>{next?"Sin coincidencias en este tramo. Continúa a la siguiente página para revisar más eventos.":"Sin coincidencias en el tramo consultado."}</p>}
 {rows.map(r=><div className="item" key={r.id}><div style={{minWidth:0,overflowWrap:"anywhere"}}><b>{r.action}</b><div className="caption">{r.target} · {r.actor}</div><div className="caption">{r.at}</div>{r.reason&&<div>{r.reason}</div>}{r.status&&<div className="caption">{r.status}{r.stripeStatus?" · Stripe: "+r.stripeStatus:""}</div>}{typeof r.amount==="number"&&r.currency==="cad"&&<b>{new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(r.amount/100)}</b>}</div></div>)}
 <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",marginTop:12}}><button className="btn secondary" disabled={history.length<2} onClick={()=>{const h=history.slice(0,-1);void load(filters,h.at(-1)??null,h);}}>Anterior</button><span className="caption">Página {history.length}</span><button className="btn secondary" disabled={!next} onClick={()=>{if(next)void load(filters,next,[...history,next]);}}>Siguiente</button></div></>}
 </section>;
}
