"use client";
import {useState} from "react";
import type {User} from "firebase/auth";
type Plan={sourceCommit:string;registration:{confirmationDigest:string;canRegister:boolean;requiresExistingAppAdoption:boolean;alreadyRegistered:boolean;problems:string[];steps:{resource:string;id:string;action:string;reason:string}[]}};
export default function ProductProvisioning({user,onRefresh}:{user:User;onRefresh:()=>Promise<void>}){
 const [appId,setAppId]=useState(""),[repository,setRepository]=useState(""),[vercelProjectId,setProject]=useState(""),[plan,setPlan]=useState<Plan|null>(null),[adopt,setAdopt]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 async function send(action:"plan"|"apply"){
  setBusy(true);setError("");setMessage("");
  try{
   const body={appId:appId.trim(),repository:repository.trim(),vercelProjectId:vercelProjectId.trim(),...(action==="apply"&&plan?{confirmationDigest:plan.registration.confirmationDigest,adoptExisting:adopt}:{})};
   const r=await fetch("/api/admin/provisioning/product/"+action,{method:"POST",headers:{authorization:"Bearer "+await user.getIdToken(),"content-type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
   const data=await r.json();if(!r.ok)throw new Error(data.error||"Operación no disponible");
   if(action==="plan"){setPlan(data);setAdopt(false)}else{setMessage(data.status==="ALREADY_REGISTERED"?"Producto ya registrado y verificado.":"Producto registrado y verificado.");setPlan(null);await onRefresh()}
  }catch(e){setError((e as Error).message);setPlan(null)}finally{setBusy(false)}
 }
 function change(set:(v:string)=>void,v:string){set(v);setPlan(null);setAdopt(false);setMessage("");setError("")}
 return <section className="panel"><h2 className="subheading">Aprovisionamiento de producto</h2><p className="caption">Registro técnico único. Reutiliza GitHub, Vercel y catálogo; no activa licencias ni crea clientes.</p>
 <form onSubmit={e=>{e.preventDefault();void send("plan")}}><div style={{display:"grid",gap:12,maxWidth:620}}>
 <label>ID de aplicación<input required disabled={busy} value={appId} onChange={e=>change(setAppId,e.target.value)} placeholder="ID del catálogo"/></label>
 <label>Repositorio GitHub<input required disabled={busy} value={repository} onChange={e=>change(setRepository,e.target.value)} placeholder="organización/repositorio"/></label>
 <label>ID proyecto Vercel<input required disabled={busy} value={vercelProjectId} onChange={e=>change(setProject,e.target.value)} placeholder="prj_…"/></label>
 <button className="btn" disabled={busy} type="submit">{busy?"Procesando…":"Generar PLAN"}</button></div></form>
 {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status">{message}</p>}
 {plan&&<div><p className="caption">Commit: {plan.sourceCommit}</p>{plan.registration.steps.map((s,i)=><div key={s.resource+s.id+i} className="item"><div><b>{s.id}</b><div className="caption">{s.reason}</div></div><span>{s.action}</span></div>)}
 {plan.registration.problems.map(p=><p key={p} className="error">{p}</p>)}
 {plan.registration.requiresExistingAppAdoption&&<label><input type="checkbox" checked={adopt} disabled={busy} onChange={e=>setAdopt(e.target.checked)}/> Confirmo vincular el registro existente a estos proveedores.</label>}
 <button className="btn" disabled={busy||!plan.registration.canRegister||(plan.registration.requiresExistingAppAdoption&&!adopt)} onClick={()=>void send("apply")}>{plan.registration.alreadyRegistered?"Verificar registro":"Registrar producto (APPLY)"}</button></div>}</section>
}
