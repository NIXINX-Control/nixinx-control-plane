"use client";
import {useEffect,useRef,useState} from "react";
import type {User} from "firebase/auth";
type Lang="es"|"en"|"fr";
type Filters={customer:string;kind:string;status:string;from:string;to:string};
type Event={actor:string;role:string;at:number;from:string;to:string;reply:string|null};
type Ticket={id:string;customer:string;acronym:string;kind:string;subject:string;description:string;appId:string|null;status:string;date:number|null;revision:number;assignedTo:string|null;history?:Event[];historyCount:number;notification:string|null};
const initial:Filters={customer:"",kind:"",status:"",from:"",to:""};
const kinds=["support","claim","cancellation","commercial"],statuses=["OPEN","IN_PROGRESS","RESOLVED","CLOSED"];
const transitions:Record<string,string[]>={OPEN:["OPEN","IN_PROGRESS","RESOLVED"],IN_PROGRESS:["IN_PROGRESS","RESOLVED"],RESOLVED:["RESOLVED","IN_PROGRESS","CLOSED"],CLOSED:[]};
const words={
 es:{title:"Solicitudes comerciales y soporte",customer:"Cliente (nombre, acrónimo o correo)",type:"Tipo",status:"Estado",from:"Desde (UTC)",to:"Hasta (UTC)",all:"Todos",search:"Buscar",clear:"Limpiar",loading:"Consultando…",empty:"Sin coincidencias en este tramo.",more:"Siguiente",back:"Anterior",page:"Página",scanned:"Solicitudes examinadas",app:"Aplicación",general:"General",owner:"Responsable",notification:"Aviso interno",history:"Historial de atención",reply:"Respuesta visible para el cliente",save:"Guardar atención",success:"Atención guardada.",error:"No se pudo completar. Actualiza antes de reintentar.",stale:"Otra atención modificó la solicitud. Actualiza antes de reintentar.",boundary:"Resolver una solicitud de cancelación no cancela la suscripción, licencia ni infraestructura.",kind:["Soporte","Reclamación","Cancelación","Solicitud comercial"],state:["Abierta","En revisión","Resuelta","Cerrada"],notice:["No configurado","Aceptado por proveedor","Fallido","Indeterminado","Pendiente"],language:"Idioma",reference:"Referencia",replyRequired:"Escribe la respuesta de resolución.",view:"Consultar / atender",close:"Volver a la lista"},
 en:{title:"Commercial requests and support",customer:"Customer (name, acronym or email)",type:"Type",status:"Status",from:"From (UTC)",to:"To (UTC)",all:"All",search:"Search",clear:"Clear",loading:"Loading…",empty:"No matches in this page.",more:"Next",back:"Previous",page:"Page",scanned:"Requests scanned",app:"Application",general:"General",owner:"Assigned staff",notification:"Internal alert",history:"Handling history",reply:"Customer-visible reply",save:"Save response",success:"Response saved.",error:"Unable to complete. Refresh before retrying.",stale:"Another staff member changed this request. Refresh before retrying.",boundary:"Resolving a cancellation request does not cancel a subscription, license or infrastructure.",kind:["Support","Claim","Cancellation","Commercial request"],state:["Open","In progress","Resolved","Closed"],notice:["Not configured","Provider accepted","Failed","Unknown","Pending"],language:"Language",reference:"Reference",replyRequired:"Enter the resolution reply.",view:"View / handle",close:"Back to list"},
 fr:{title:"Demandes commerciales et assistance",customer:"Client (nom, acronyme ou courriel)",type:"Type",status:"État",from:"Du (UTC)",to:"Au (UTC)",all:"Tous",search:"Rechercher",clear:"Effacer",loading:"Chargement…",empty:"Aucun résultat dans cette page.",more:"Suivant",back:"Précédent",page:"Page",scanned:"Demandes examinées",app:"Application",general:"Général",owner:"Responsable",notification:"Alerte interne",history:"Historique du traitement",reply:"Réponse visible par le client",save:"Enregistrer",success:"Réponse enregistrée.",error:"Impossible de terminer. Actualisez avant de réessayer.",stale:"Un autre agent a modifié cette demande. Actualisez avant de réessayer.",boundary:"Résoudre une demande de résiliation ne résilie ni abonnement, ni licence, ni infrastructure.",kind:["Assistance","Réclamation","Résiliation","Demande commerciale"],state:["Ouverte","En cours","Résolue","Fermée"],notice:["Non configuré","Accepté par le fournisseur","Échec","Inconnu","En attente"],language:"Langue",reference:"Référence",replyRequired:"Saisissez la réponse de résolution.",view:"Consulter / traiter",close:"Retour à la liste"}
};
export default function CommercialSupport({user}:{user:User}){
 const [lang,setLang]=useState<Lang>("es"),[draft,setDraft]=useState(initial),[filters,setFilters]=useState(initial),[rows,setRows]=useState<Ticket[]>([]),[next,setNext]=useState<string|null>(null),[stack,setStack]=useState<(string|null)[]>([null]),[scanned,setScanned]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState(false),[selected,setSelected]=useState<Ticket|null>(null),[status,setStatus]=useState(""),[reply,setReply]=useState("");
 const generation=useRef(0),w=words[lang];
 const kind=(v:string)=>w.kind[kinds.indexOf(v)]??v,state=(v:string)=>w.state[statuses.indexOf(v)]??v;
 const date=(v:number|null)=>v===null?"—":new Intl.DateTimeFormat(lang,{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"}).format(v)+" UTC";
 async function call(body:object){
  const token=await user.getIdToken(),r=await fetch("/api/admin/commercial/support",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"}),v=await r.json();
  if(!r.ok)throw Error(v.error||"SUPPORT_UNAVAILABLE");return v;
 }
 async function load(f:Filters,cursor:string|null,h:(string|null)[],saved=false){
  const g=++generation.current;setBusy(true);setError("");setSuccess(saved);setSelected(null);setReply("");setRows([]);setNext(null);setScanned(0);
  try{const v=await call({operation:"list",...f,cursor});if(!Array.isArray(v.items))throw Error("SUPPORT_UNAVAILABLE");if(g!==generation.current)return;setRows(v.items);setNext(v.cursor??null);setScanned(v.scanned??0);setStack(h);setFilters(f);}
  catch(e){if(g===generation.current)setError((e as Error).message);}finally{if(g===generation.current)setBusy(false);}
 }
 useEffect(()=>{const local=localStorage.getItem("nixinx-support-language");if(local==="es"||local==="en"||local==="fr")setLang(local);void load(initial,null,[null]);return()=>{generation.current++;};},[user.uid]);
 async function open(r:Ticket){
  if(busy)return;const g=++generation.current;setBusy(true);setError("");setSuccess(false);setSelected(null);setReply("");
  try{const v=await call({operation:"detail",id:r.id});if(g!==generation.current)return;
   if(v.id!==r.id||!Array.isArray(v.history))throw Error("SUPPORT_UNAVAILABLE");
   const current={...r,...v};setSelected(current);setRows(prev=>prev.map(x=>x.id===r.id?{...x,status:v.status,revision:v.revision,assignedTo:v.assignedTo,historyCount:v.history.length}:x));
   setStatus(transitions[current.status]?.find(s=>s!==current.status)??current.status);
  }catch(e){if(g===generation.current)setError((e as Error).message);}finally{if(g===generation.current)setBusy(false);}
 }
 async function save(){
  if(!selected||busy)return;
  if(status==="RESOLVED"&&!reply.trim()){setError("SUPPORT_REPLY_INVALID");return;}
  const g=++generation.current;setBusy(true);setError("");setSuccess(false);
  try{await call({operation:"update",id:selected.id,revision:selected.revision,status,reply});if(g!==generation.current)return;await load(filters,stack.at(-1)??null,stack,true);}
  catch(e){if(g===generation.current){setError((e as Error).message);setSelected(null);setReply("");setRows([]);}}finally{if(g===generation.current)setBusy(false);}
 }
 const field=(k:keyof Filters,v:string)=>setDraft(p=>({...p,[k]:v}));
 const style={minWidth:0,overflowWrap:"anywhere" as const};
 return <section className="panel" style={style}><h3 className="subheading">{w.title}</h3><label className="field">{w.language}<select value={lang} onChange={e=>{const l=e.target.value as Lang;setLang(l);localStorage.setItem("nixinx-support-language",l);}}><option value="es">Español</option><option value="en">English</option><option value="fr">Français</option></select></label><p className="caption">{w.boundary}</p>
 <form onSubmit={e=>{e.preventDefault();void load(draft,null,[null]);}} style={{display:"grid",gap:12}}>
 <label className="field">{w.customer}<input value={draft.customer} maxLength={160} onChange={e=>field("customer",e.target.value)}/></label>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,160px),1fr))",gap:10}}>
 <label className="field">{w.type}<select value={draft.kind} onChange={e=>field("kind",e.target.value)}><option value="">{w.all}</option>{kinds.map(k=><option key={k} value={k}>{kind(k)}</option>)}</select></label>
 <label className="field">{w.status}<select value={draft.status} onChange={e=>field("status",e.target.value)}><option value="">{w.all}</option>{statuses.map(s=><option key={s} value={s}>{state(s)}</option>)}</select></label>
 <label className="field">{w.from}<input type="date" value={draft.from} onChange={e=>field("from",e.target.value)}/></label><label className="field">{w.to}<input type="date" value={draft.to} onChange={e=>field("to",e.target.value)}/></label></div>
 <div style={{display:"flex",flexWrap:"wrap",gap:8}}><button className="btn" disabled={busy}>{w.search}</button><button type="button" className="btn secondary" disabled={busy} onClick={()=>{setDraft(initial);void load(initial,null,[null]);}}>{w.clear}</button></div></form>
 {error&&<p role="alert" className="error">{error==="SUPPORT_STALE"?w.stale:error==="SUPPORT_REPLY_INVALID"?w.replyRequired:w.error} ({error})</p>}{success&&<p role="status">{w.success}</p>}
 {busy?<p role="status">{w.loading}</p>:<><p className="caption">{w.scanned}: {scanned} · {w.page} {stack.length}</p>{!rows.length&&!error&&<p>{w.empty}</p>}
 {rows.map(r=><article key={r.id} className="item" style={{...style,display:"grid",gap:8}}><div style={style}><b>{r.subject}</b><div className="caption">{r.customer} {r.acronym&&" · "+r.acronym} · {kind(r.kind)} · {state(r.status)} · {date(r.date)}</div><div className="caption">{w.app}: {r.appId??w.general} · {w.owner}: {r.assignedTo??"—"}</div><div className="caption">{w.reference}: {r.id}</div><div className="caption">{w.notification}: {w.notice[["NOT_CONFIGURED","ACCEPTED","FAILED","UNKNOWN","PENDING"].indexOf(r.notification??"")]??"—"}</div><p style={{whiteSpace:"pre-wrap"}}>{r.description}</p></div>
 {selected?.id===r.id&&Boolean(selected.history?.length)&&<details open><summary>{w.history} ({selected.history?.length})</summary>{selected.history?.map((h,i)=><div key={i} style={{...style,whiteSpace:"pre-wrap",marginTop:8}}><small>{date(h.at)} · {h.actor} ({h.role}) · {state(h.from)} → {state(h.to)}</small>{h.reply&&<p>{h.reply}</p>}</div>)}</details>}
 {selected?.id!==r.id&&<button className="btn secondary" onClick={()=>void open(r)}>{w.view}</button>}{selected?.id===r.id&&<button className="btn secondary" onClick={()=>{setSelected(null);setReply("");}}>{w.close}</button>}
 {selected?.id===r.id&&Boolean(transitions[r.status]?.length)&&<form onSubmit={e=>{e.preventDefault();void save();}} style={{display:"grid",gap:8}}><label className="field">{w.status}<select value={status} onChange={e=>setStatus(e.target.value)}>{transitions[r.status].map(s=><option key={s} value={s}>{state(s)}</option>)}</select></label><label className="field">{w.reply}<textarea rows={4} maxLength={2000} required={status==="RESOLVED"||status===r.status} value={reply} onChange={e=>setReply(e.target.value)}/></label><button className="btn" disabled={busy}>{w.save}</button></form>}</article>)}
 <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:12}}><button className="btn secondary" disabled={stack.length<2} onClick={()=>{const h=stack.slice(0,-1);void load(filters,h.at(-1)??null,h);}}>{w.back}</button><button className="btn secondary" disabled={!next} onClick={()=>{if(next)void load(filters,next,[...stack,next]);}}>{w.more}</button></div></>}
 </section>;
}
