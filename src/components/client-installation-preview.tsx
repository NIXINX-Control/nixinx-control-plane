"use client";
import {useEffect,useState} from "react";
import type {User} from "firebase/auth";
import {canonicalHostname} from "@/lib/client-hostname-draft";
type Saved={version?:number;stagedAt?:string|null;planId:string;status:string;createdAt:string};
type Plan={durablePlan?:Saved;providerEvidence?:{releaseVerified?:boolean;scope?:string;dnsVerified?:boolean};status:string;hostname?:string|null;steps:{resource:string;status:string;reason:string;owner:string;evidence?:string}[];writes:number};
const labels:Record<string,string>={tenant:"Cliente",product:"Producto y manifiesto",release:"Release y routing",dns:"Configuración DNS",googleBinding:"Delegación Google",firebaseResources:"Infraestructura Firebase",permissionPreflight:"Preflight IAM",sdk:"Configuración SDK",legalIdentity:"Identidad jurídica",billingPayer:"Pagador",security:"Seguridad y segregación",hostname:"Hostname automático",configuration:"Configuración runtime",installation:"Instalación",runtimeAndData:"Runtime y autorización de datos",license:"Licencia"};
export default function ClientInstallationPreview({user,tenantId,appId}:{user:User;tenantId:string;appId:string}){
 let hostname="";try{hostname=canonicalHostname(tenantId,appId)}catch{/* Explicit reconciliation is required. */}
 const [plan,setPlan]=useState<Plan|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const durable=tenantId==="HTL" && appId==="initiatives";
 const [verifiedPlan,setVerifiedPlan]=useState("");
 const [saved,setSaved]=useState<Saved|null>(null);
 useEffect(()=>{
  let current=true;
  setSaved(null);
  if(durable) void user.getIdToken().then(token=>fetch("/api/admin/provisioning/client/installation-plan?tenantId=HTL",{headers:{authorization:"Bearer "+token},cache:"no-store"})).then(async r=>{if(r.ok){const d=await r.json();if(current)setSaved(d.durablePlan)}}).catch(()=>{});
  return ()=>{current=false};
 },[durable,user]);
 async function run(){
  setBusy(true);setError("");setPlan(null);
  try{const r=await fetch("/api/admin/provisioning/client/"+(durable?"installation-plan":"plan")+"?tenantId="+encodeURIComponent(tenantId),{method:durable?"POST":"GET",headers:{authorization:"Bearer "+await user.getIdToken()},cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"CLIENT_PLAN_UNAVAILABLE");setPlan(d);if(d.durablePlan)setSaved(d.durablePlan)}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }

 async function verifyModule(){
  if(!saved)return;
  setBusy(true);setError("");
  try {
   const response=await fetch("/api/admin/provisioning/client/verify-module?tenantId=HTL",{
    method:"POST",headers:{authorization:"Bearer "+await user.getIdToken(),"content-type":"application/json"},
    body:JSON.stringify({planId:saved.planId})
   });
   const result=await response.json();
   if(!response.ok)throw Error(result.error||"MODULE_VERIFICATION_FAILED");
   setVerifiedPlan(saved.planId);
  } catch(e){setError((e as Error).message)} finally{setBusy(false)}
 }
 async function stage(){
  if(!saved)return;
  setBusy(true);setError("");
  try {
   const r=await fetch("/api/admin/provisioning/client/installation-apply?tenantId=HTL",{method:"POST",headers:{authorization:"Bearer "+await user.getIdToken(),"content-type":"application/json"},body:JSON.stringify({planId:saved.planId})});
   const result=await r.json();
   if(!r.ok)throw Error(result.error||"INSTALLATION_STAGE_FAILED");
   setSaved({...saved,stagedAt:result.createdAt});
  } catch(e){setError((e as Error).message)} finally{setBusy(false)}
 }
 return <section style={{marginTop:20,overflowWrap:"anywhere"}}><h3 className="subheading">{durable?"PLAN de instalación":"Vista previa PLAN de instalación"}</h3><p className="caption">Consulta el expediente y catálogo reales. Comprueba release, routing, DNS y configuración SDK candidata con proveedores cuando el expediente es elegible. {durable?"Guarda la evidencia del PLAN en Control. La instalación queda pendiente de APPLY.":"No escribe registros ni autoriza APPLY."}</p><button type="button" className="btn secondary" disabled={busy} onClick={()=>void run()}>{busy?"Consultando…":durable?"Preparar y guardar PLAN":"Preparar PLAN preliminar"}</button>
 <p style={{overflowWrap:"anywhere"}}><b>Hostname:</b> {hostname||"Pendiente de conciliación DNS"}</p>
 {durable&&saved&&<p className="notice" role="status">PLAN guardado · {saved.planId} · {saved.createdAt} · {saved.stagedAt?"configuración preparada":"pendiente de APPLY"}</p>}
 {durable&&saved?.version===2&&(saved.stagedAt
 ? <p role="status">Configuración de instalación guardada · {saved.stagedAt} · acceso inactivo.</p>
 : <div><p className="caption">Guarda la configuración de HTL en Control. El dominio y la activación quedan pendientes.</p><button type="button" className="btn secondary" disabled={busy} onClick={()=>void stage()}>Preparar instalación inactiva</button></div>)}
 {durable&&saved?.stagedAt&&(verifiedPlan===saved.planId
  ? <p role="status">Módulo Iniciativas verificado para licencias.</p>
  : <button className="btn secondary" disabled={busy} onClick={()=>void verifyModule()}>Verificar módulo Iniciativas para licencias</button>)}
 {error&&<p role="alert" className="error">{error}</p>}
 {plan&&<div><p className="notice" role="status">Comprobaciones previas · escrituras en proveedores: {plan.writes}</p>{plan.providerEvidence?.releaseVerified&&<p className="caption">Release registrado verificado. Routing: alcance visible del equipo Vercel; DNS consultado por proveedor cuando disponible; asignación y control global no certificados.</p>}{plan.steps.map(s=><div className="item" key={s.resource}><div><b>{labels[s.resource]||s.resource} · {s.status}</b><div className="caption">{s.reason} · {s.owner}</div>{s.evidence&&<div className="caption">Evidencia: {s.evidence}</div>}</div></div>)}<p className="caption">REUSE indica evidencia histórica conciliada, no acceso fresco ni autorización operativa. Titular/pagador: verificar con documentación y <a href="https://console.cloud.google.com/billing" target="_blank" rel="noreferrer">Cloud Billing</a>. Hostname, seguridad y APPLY pendientes.</p></div>}
 </section>
}
