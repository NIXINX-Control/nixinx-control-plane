"use client";
import {useState} from "react";
import type {User} from "firebase/auth";
export default function GoogleFederationConnection({user}:{user:User}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[ttl,setTtl]=useState<number|null>(null);
 async function verify(){
  if(busy)return;setBusy(true);setError("");setTtl(null);
  try{
   const res=await fetch("/api/admin/provisioning/connections/google",{method:"POST",headers:{authorization:"Bearer "+await user.getIdToken()},cache:"no-store"});
   const data=await res.json();
   if(!res.ok)throw Error(data.error||"GOOGLE_FEDERATION_UNVERIFIED");
   if(data.status!=="STS_EXCHANGE_VERIFIED"||!Number.isInteger(data.expiresIn))throw Error("GOOGLE_FEDERATION_UNVERIFIED");
   setTtl(data.expiresIn);
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <div style={{marginTop:16}}><h3>Google Cloud · Workload Identity Federation</h3>
 <p>Identidad corporativa de Control Production. Intercambio de credencial temporal mediante Google STS; no se solicitan claves ni se accede a proyectos cliente.</p>
 <button type="button" className="btn secondary" disabled={busy} onClick={()=>void verify()}>{busy?"Validando…":"Verificar federación Google"}</button>
 {error&&<p className="error" role="alert">{error}</p>}
 {ttl!==null&&<p className="notice" role="status">Federación Google verificada (STS). Vigencia de credencial: {ttl} segundos. Delegación cliente y permisos operativos pendientes.</p>}
 <p className="caption">Esta comprobación no habilita licencias, no concede IAM ni certifica permisos de cliente. No se muestran ni almacenan tokens.</p></div>
}
