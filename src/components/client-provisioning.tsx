"use client";
import {useState,useEffect} from "react";
import type {User} from "firebase/auth";
type Profile={tenantId:string;legalName:string;legalIdentifier:string;jurisdiction:string;contactEmail:string;appId:string};
type Intake={tenantId:string;appId:string;hostname:string;status:string;profile:Profile;requirements:{sourceCommit:string;requiredResources:string[];derivedFirebaseKeys:string[];conditionalResources:string[];steps:{id:string;status:string;owner:string;instruction:string}[]}};
type Summary={tenantId:string;appId:string;status:string};
const blank:Profile={tenantId:"",legalName:"",legalIdentifier:"",jurisdiction:"",contactEmail:"",appId:""};
export default function ClientProvisioning({user,apps}:{user:User;apps:{id:string;name?:string;status?:string}[]}){
 const [draft,setDraft]=useState<Profile>(blank),[record,setRecord]=useState<Intake|null>(null),[list,setList]=useState<Summary[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[truncated,setTruncated]=useState(false);
 useEffect(()=>{let cancelled=false;void (async()=>{try{const response=await fetch("/api/admin/provisioning/client",{headers:{authorization:"Bearer "+await user.getIdToken()},cache:"no-store"});const data=await response.json();if(!response.ok)throw Error(data.error||"No se pudieron consultar los expedientes");if(!cancelled){setList(data.intakes);setTruncated(data.truncated)}}catch(e){if(!cancelled)setError((e as Error).message)}})();return()=>{cancelled=true}},[user]);
 function change(k:keyof Profile,v:string){setDraft(d=>({...d,[k]:v}));setRecord(null);setMessage("");setError("")}
 async function run(mode:"save"|"open",tenantId?:string){
  setBusy(true);setError("");setMessage("");setRecord(null);
  try{
   const url="/api/admin/provisioning/client"+(mode==="open"?"?tenantId="+encodeURIComponent(tenantId||""):"");
   const response=await fetch(url,{method:mode==="save"?"POST":"GET",headers:{authorization:"Bearer "+await user.getIdToken(),"content-type":"application/json"},...(mode==="save"?{body:JSON.stringify(draft)}:{}),cache:"no-store"});
   const data=await response.json();if(!response.ok)throw Error(data.error||"Operación no disponible");
   const intake=data.intake as Intake;setRecord(intake);setDraft(intake.profile);
   setList(old=>old.some(x=>x.tenantId===intake.tenantId)?old:[...old,{tenantId:intake.tenantId,appId:intake.appId,status:intake.status}]);
   setMessage(mode==="open"?"Expediente recuperado.":data.status==="ALREADY_SAVED"?"Expediente existente verificado, sin nuevas escrituras.":"Expediente preliminar guardado y verificado.");
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <section className="panel"><h2 className="subheading">Aprovisionamiento de clientes</h2><p className="caption">Expediente preliminar persistente. No crea recursos, licencias ni concede acceso. Solo superadministrador.</p>
 {list.length>0&&<div><p className="caption">Retomar expediente existente</p>{list.map(x=><button key={x.tenantId} type="button" className="btn secondary" disabled={busy} onClick={()=>void run("open",x.tenantId)} style={{margin:4,maxWidth:"100%",overflowWrap:"anywhere"}}>{x.tenantId} · {x.appId}</button>)}</div>}
 {truncated&&<p className="caption">Listado limitado; consulta un expediente por su ID.</p>}
 <form onSubmit={e=>{e.preventDefault();void run("save")}}><div className="stack" style={{maxWidth:620,minWidth:0}}>
 <label className="field">ID de cliente<input required maxLength={39} disabled={busy} value={draft.tenantId} onChange={e=>change("tenantId",e.target.value)} placeholder="Identificador único en minúsculas"/></label>
 <button type="button" className="btn secondary" disabled={busy||!draft.tenantId} onClick={()=>void run("open",draft.tenantId)}>Recuperar por ID</button>
 <label className="field">Razón social<input required maxLength={120} disabled={busy} value={draft.legalName} onChange={e=>change("legalName",e.target.value)}/></label>
 <label className="field">Identificación jurídica<input required maxLength={120} disabled={busy} value={draft.legalIdentifier} onChange={e=>change("legalIdentifier",e.target.value)} placeholder="Según documento oficial"/></label>
 <label className="field">Jurisdicción de registro<input required maxLength={120} disabled={busy} value={draft.jurisdiction} onChange={e=>change("jurisdiction",e.target.value)}/></label>
 <label className="field">Correo del contacto autorizado<input required type="email" maxLength={254} disabled={busy} value={draft.contactEmail} onChange={e=>change("contactEmail",e.target.value)}/></label>
 <label className="field">Producto inicial<select required disabled={busy} value={draft.appId} onChange={e=>change("appId",e.target.value)}><option value="">Seleccionar</option>{apps.filter(a=>a.status==="active").map(a=><option key={a.id} value={a.id}>{a.name||a.id}</option>)}</select></label>
 <button className="btn" type="submit" disabled={busy}>{busy?"Procesando…":"Guardar expediente preliminar"}</button>
 <button type="button" className="btn secondary" disabled={busy} onClick={()=>{setDraft(blank);setRecord(null);setMessage("");setError("")}}>Nuevo expediente</button>
 </div></form>
 {error&&<p className="error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 {record&&<div style={{overflowWrap:"anywhere",marginTop:16}}><h3 className="subheading">Siguientes requisitos</h3><p>Hostname candidato: {record.hostname}</p><p className="caption">Commit registrado: {record.requirements.sourceCommit}</p><p>Recursos requeridos: {record.requirements.requiredResources.join(", ")||"Ninguno declarado"}</p><p>Configuración a descubrir: {record.requirements.derivedFirebaseKeys.join(", ")||"No declarada"}</p><p>Recursos condicionales (no crear automáticamente): {record.requirements.conditionalResources.join(", ")||"Ninguno"}</p>{record.requirements.steps.map(s=><div className="item" key={s.id}><div><b>{s.instruction}</b><div className="caption">{s.owner} · Pendiente</div></div></div>)}<p className="caption">No autorizado técnicamente ni comercialmente.</p></div>}
 </section>
}
