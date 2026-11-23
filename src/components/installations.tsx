"use client";
import {useEffect,useState} from "react";
import type {User} from "firebase/auth";
type Tenant={id:string;name?:string;status?:string};
type Installation={hostname:string;tenantId:string;appId:string;environment:string;verified?:boolean;status:string;firebaseProjectId?:string;sandboxOrgId?:string};

export default function Installations({user,tenants}:{user:User;tenants:Tenant[]}){
 const [items,setItems]=useState<Installation[]>([]);
 const [tenantId,setTenantId]=useState("");
 const [hostname,setHostname]=useState("nelcy-preview.corporate.nixinx.app");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [disable,setDisable]=useState("");
 const [reason,setReason]=useState("");
 async function request(method:string,body?:unknown){
  const token=await user.getIdToken();
  const r=await fetch("/api/admin/installations",{
   method,cache:"no-store",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||"No se pudo completar la operación");
  return data;
 }
 async function refresh(){
  try{const r=await request("GET");setItems(r.installations||[])}
  catch(e){setError(e instanceof Error?e.message:"No se pudieron consultar las instalaciones")}
 }
 useEffect(()=>{void refresh();},[user]);
 async function verify(){
  if(!tenantId){setError("Selecciona el cliente autorizado");return}
  setBusy(true);setError("");setNotice("");
  try{
   await request("POST",{tenantId,hostname:hostname.trim().toLowerCase()});
   setNotice("Instalación verificada contra el Corporate Preview y registrada en auditoría.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Falló la verificación")}finally{setBusy(false)}
 }
 async function disableInstallation(){
  if(!reason.trim())return;
  setBusy(true);setError("");setNotice("");
  try{
   await request("PATCH",{hostname:disable,reason:reason.trim()});
   setNotice("Instalación deshabilitada y auditada.");
   setDisable("");setReason("");await refresh();
  }catch(e){setError(e instanceof Error?e.message:"No se pudo deshabilitar")}finally{setBusy(false)}
 }
 return <section className="panel">
  <h3 className="subheading">Instalaciones de Corporate</h3>
  <p className="caption">Una instalación solo se activa cuando Control verifica su hostname, entorno Preview, Firebase sandbox y organización. El estado de la licencia se gestiona por separado.</p>
  {error&&<p className="error" role="alert">{error}</p>}
  {notice&&<p className="notice" role="status">{notice}</p>}
  <div className="fields">
   <label className="field">Cliente
    <select value={tenantId} onChange={e=>setTenantId(e.target.value)} disabled={busy}>
     <option value="">Selecciona un cliente</option>
     {tenants.filter(t=>t.status==="active").map(t=><option key={t.id} value={t.id}>{t.name||t.id} ({t.id})</option>)}
    </select>
   </label>
   <label className="field">Hostname exacto
    <input value={hostname} onChange={e=>setHostname(e.target.value)} disabled={busy}/>
   </label>
   <div className="row full"><button className="btn" disabled={busy||!tenantId} onClick={()=>void verify()}>{busy?"Verificando…":"Verificar e instalar"}</button>
    <button className="btn secondary" disabled={busy} onClick={()=>void refresh()}>Actualizar</button>
   </div>
  </div>
  <h3 className="subheading" style={{marginTop:24}}>Instalaciones registradas</h3>
  {items.length===0?<p className="empty">No hay instalaciones registradas.</p>:items.map(i=><div className="item" key={i.hostname}>
    <div style={{minWidth:0}}>
     <b>{i.hostname}</b>
     <div className="caption">Cliente: {i.tenantId} · Aplicación: {i.appId} · {i.environment}</div>
     <div className="caption">Estado: {i.status} · Verificación: {i.verified?"Confirmada":"Pendiente"}</div>
     {i.firebaseProjectId&&<div className="caption">Firebase: {i.firebaseProjectId} · Organización: {i.sandboxOrgId}</div>}
    </div>
    <button className="btn outline tiny" disabled={busy||i.status==="disabled"} onClick={()=>{setDisable(i.hostname);setReason("");setError("");}}>Deshabilitar</button>
   </div>)}
  {disable&&<div className="panel" role="dialog" aria-label="Deshabilitar instalación">
   <h3 className="subheading">Deshabilitar {disable}</h3>
   <label className="field">Motivo obligatorio<textarea value={reason} rows={2} maxLength={500} onChange={e=>setReason(e.target.value)}/></label>
   <div className="row">
    <button className="btn" disabled={busy||!reason.trim()} onClick={()=>void disableInstallation()}>Confirmar</button>
    <button className="btn secondary" disabled={busy} onClick={()=>setDisable("")}>Cancelar</button>
   </div>
  </div>}
 </section>;
}
