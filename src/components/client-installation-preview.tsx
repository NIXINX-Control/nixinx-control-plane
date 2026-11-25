"use client";
import {useState} from "react";
import type {User} from "firebase/auth";
import {canonicalHostname} from "@/lib/client-hostname-draft";
type Plan={providerEvidence?:{releaseVerified?:boolean;scope?:string;dnsVerified?:boolean};status:string;hostname?:string|null;steps:{resource:string;status:string;reason:string;owner:string;evidence?:string}[];writes:number};
const labels:Record<string,string>={tenant:"Cliente",product:"Producto y manifiesto",release:"Release y routing",googleBinding:"Delegación Google",firebaseResources:"Infraestructura Firebase",permissionPreflight:"Preflight IAM",sdk:"Configuración SDK",legalIdentity:"Identidad jurídica",billingPayer:"Pagador",security:"Seguridad y segregación",hostname:"Hostname automático",configuration:"Configuración runtime",installation:"Instalación",runtimeAndData:"Runtime y autorización de datos",license:"Licencia"};
export default function ClientInstallationPreview({user,tenantId,appId}:{user:User;tenantId:string;appId:string}){
 let hostname="";try{hostname=canonicalHostname(tenantId,appId)}catch{/* Explicit reconciliation is required. */}
 const [plan,setPlan]=useState<Plan|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function run(){
  setBusy(true);setError("");setPlan(null);
  try{const r=await fetch("/api/admin/provisioning/client/plan?tenantId="+encodeURIComponent(tenantId),{headers:{authorization:"Bearer "+await user.getIdToken()},cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"CLIENT_PLAN_UNAVAILABLE");setPlan(d)}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }

 return <section style={{marginTop:20,overflowWrap:"anywhere"}}><h3 className="subheading">Vista previa PLAN de instalación</h3><p className="caption">Consulta el expediente y catálogo reales. Comprueba release y routing con proveedores cuando el expediente es elegible. No escribe registros ni autoriza APPLY.</p><button type="button" className="btn secondary" disabled={busy} onClick={()=>void run()}>{busy?"Consultando…":"Preparar PLAN preliminar"}</button>
 <p style={{overflowWrap:"anywhere"}}><b>Hostname:</b> {hostname||"Pendiente de conciliación DNS"}</p>
 {error&&<p role="alert" className="error">{error}</p>}
 {plan&&<div><p className="notice" role="status">PLAN preliminar: gates pendientes · escrituras: {plan.writes}</p>{plan.providerEvidence?.releaseVerified&&<p className="caption">Release registrado verificado. Routing: alcance visible del equipo Vercel; DNS externo no certificado.</p>}{plan.steps.map(s=><div className="item" key={s.resource}><div><b>{labels[s.resource]||s.resource} · {s.status}</b><div className="caption">{s.reason} · {s.owner}</div>{s.evidence&&<div className="caption">Evidencia: {s.evidence}</div>}</div></div>)}<p className="caption">REUSE indica evidencia histórica conciliada, no acceso fresco ni autorización operativa. Titular/pagador: verificar con documentación y <a href="https://console.cloud.google.com/billing" target="_blank" rel="noreferrer">Cloud Billing</a>. Hostname, seguridad y APPLY pendientes.</p></div>}
 </section>
}
