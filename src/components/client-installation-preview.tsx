"use client";
import {useState} from "react";
import type {User} from "firebase/auth";
type Plan={status:string;steps:{resource:string;status:string;reason:string;owner:string;evidence?:string}[];writes:number};
const labels:Record<string,string>={tenant:"Cliente",product:"Producto y manifiesto",release:"Release y routing",googleBinding:"Delegación Google",firebaseResources:"Infraestructura Firebase",permissionPreflight:"Preflight IAM",sdk:"Configuración SDK",legalIdentity:"Identidad jurídica",billingPayer:"Pagador",security:"Seguridad y segregación",hostname:"Hostname explícito",configuration:"Configuración runtime",installation:"Instalación",runtimeAndData:"Runtime y autorización de datos",license:"Licencia"};
export default function ClientInstallationPreview({user,tenantId}:{user:User;tenantId:string}){
 const [plan,setPlan]=useState<Plan|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function run(){
  setBusy(true);setError("");setPlan(null);
  try{const r=await fetch("/api/admin/provisioning/client/plan?tenantId="+encodeURIComponent(tenantId),{headers:{authorization:"Bearer "+await user.getIdToken()},cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"CLIENT_PLAN_UNAVAILABLE");setPlan(d)}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <section style={{marginTop:20,overflowWrap:"anywhere"}}><h3 className="subheading">Vista previa PLAN de instalación</h3><p className="caption">Consulta el expediente y catálogo reales. No consulta proveedores de nuevo, no escribe registros y no autoriza APPLY.</p><button type="button" className="btn secondary" disabled={busy} onClick={()=>void run()}>{busy?"Consultando…":"Preparar PLAN preliminar"}</button>
 {error&&<p role="alert" className="error">{error}</p>}
 {plan&&<div><p className="notice" role="status">PLAN preliminar: gates pendientes · escrituras: {plan.writes}</p>{plan.steps.map(s=><div className="item" key={s.resource}><div><b>{labels[s.resource]||s.resource} · {s.status}</b><div className="caption">{s.reason} · {s.owner}</div>{s.evidence&&<div className="caption">Evidencia: {s.evidence}</div>}</div></div>)}<p className="caption">REUSE indica evidencia histórica conciliada, no acceso fresco ni autorización operativa. Titular/pagador: verificar con documentación y <a href="https://console.cloud.google.com/billing" target="_blank" rel="noreferrer">Cloud Billing</a>. Hostname, seguridad y APPLY pendientes.</p></div>}
 </section>
}
