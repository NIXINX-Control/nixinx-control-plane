"use client";
import {useState,useEffect,useCallback,useRef} from "react";
import type {User} from "firebase/auth";
import VercelIntegrationConnection from "@/components/vercel-integration-connection";
import GoogleFederationConnection from "@/components/google-federation-connection";
type Connection={provider:string;custody:string;status:string;operationPermissionsVerified:boolean;installationId?:number|string;expiresAt?:string};
export default function ProviderConnections({user}:{user:User}){
 const [rows,setRows]=useState<Connection[]>([]),[vault,setVault]=useState(false),[open,setOpen]=useState(false),[key,setKey]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const input=useRef<HTMLInputElement>(null);
 const load=useCallback(async()=>{setBusy(true);setError("");setMessage("Validando conexiones…");try{const res=await fetch("/api/admin/provisioning/connections",{headers:{authorization:"Bearer "+await user.getIdToken()},cache:"no-store"});const data=await res.json();if(!res.ok)throw new Error(data.error||"No disponible");setRows(data.connections);setVault(data.vaultConfigured);setMessage("Validación completada. Revisa el estado de cada proveedor.")}catch(e){setMessage("");setError((e as Error).message)}finally{setBusy(false)}},[user]);
 useEffect(()=>{void load()},[load]);
 function clear(){setKey("");if(input.current)input.current.value=""}
 async function save(){if(!key||busy)return;setBusy(true);setError("");setMessage("");try{const res=await fetch("/api/admin/provisioning/connections",{method:"POST",headers:{authorization:"Bearer "+await user.getIdToken(),"content-type":"application/json"},body:JSON.stringify({provider:"github",appId:5914516,privateKey:key}),cache:"no-store"});const data=await res.json();if(!res.ok)throw new Error(data.error||"No se verificó el guardado");setOpen(false);await load();setMessage("GitHub App validada y guardada. Los tokens de instalación se generan automáticamente.")}catch(e){setError((e as Error).message)}finally{clear();setBusy(false)}}
 const gh=rows.find(x=>x.provider==="github");
 const label=gh?.status==="IDENTITY_VERIFIED"?"Identidad e instalación verificadas; permisos de aprovisionamiento pendientes":gh?.status==="VAULT_SECRET_OR_VERSION_MISSING"?"Clave privada pendiente de registrar":gh?.status==="VAULT_ACCESS_DENIED"?"Acceso a custodia denegado":gh?.status==="GITHUB_RESOURCE_OR_INSTALLATION_MISSING"?"Instala la GitHub App en NIXINX-Software":"Revisión requerida";
 return <section className="panel"><h2 className="subheading">Advanced · Provider Connections</h2><p className="caption">Autorizaciones globales del aprovisionador. No se aceptan tokens personales.</p>
 <button type="button" className="btn secondary" disabled={busy} onClick={()=>void load()}>{busy?"Procesando…":"Validar conexiones"}</button>
 {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status" aria-live="polite" style={{padding:12,background:"#e8f4ef",color:"#164b40",borderRadius:8}}>{message}</p>}
 {!vault&&!busy&&<p>Custodia global no configurada. Revisar Secret Manager y las referencias globales existentes; no crear un proyecto nuevo.</p>}
 <div style={{marginTop:16}}><h3>GitHub App</h3><p role="status"><b>{gh?label:"Sin verificación"}</b></p><p className="caption">{gh?.status||"Sin verificación"} · {gh?.custody||"Sin consulta"}</p>
 <p>App corporativa NIXINX Control Provisioning · NIXINX-Software · App ID 5914516. Emisión automática de tokens de instalación de corta duración. Los permisos se limitan por operación y repositorio.</p>
 <p><a style={{textDecoration:"underline",color:"#176b58"}} href="https://github.com/organizations/NIXINX-Software/settings/apps/nixinx-control-provisioning" target="_blank" rel="noreferrer">Administrar GitHub App</a> · <a style={{textDecoration:"underline",color:"#176b58"}} href="https://github.com/apps/nixinx-control-provisioning/installations/new" target="_blank" rel="noreferrer">Instalar App</a></p>
 {gh?.installationId&&<p className="caption">Instalación verificada: {gh.installationId}. Expiración del último token de prueba: {gh.expiresAt}.</p>}
 <button type="button" className="btn secondary" disabled={!vault||busy} aria-expanded={open} onClick={()=>{setOpen(true);clear();setError("");setMessage("")}}>Configurar GitHub App</button>
 {open&&<form style={{marginTop:12,padding:16,border:"1px solid #a6c9be",borderRadius:10}} onSubmit={e=>{e.preventDefault();void save()}}><h3>Clave privada GitHub App</h3><p>En Credentials genera la clave privada PEM e instala la App en NIXINX-Software. Selecciona aquí el archivo descargado. Se verifica la App y su instalación antes de guardar en Secret Manager. No se conserva el archivo en el navegador después de enviar o cancelar.</p>
 <label>Archivo PEM<input ref={input} type="file" accept=".pem" required disabled={busy} style={{display:"block",width:"100%",maxWidth:"100%",marginTop:8}} onChange={async e=>{const f=e.target.files?.[0];setKey("");setError("");if(!f)return;if(f.size>8192){setError("Archivo demasiado grande");return}try{setKey(await f.text())}catch{setError("No se pudo leer el archivo")}}}/></label>
 <button type="submit" className="btn" disabled={busy||!key}>Validar y guardar</button> <button type="button" className="btn secondary" disabled={busy} onClick={()=>{clear();setOpen(false)}}>Cancelar</button></form>}</div>
 <VercelIntegrationConnection user={user} vault={vault} row={rows.find(x=>x.provider==="vercel")} onRefresh={load}/>
 <GoogleFederationConnection user={user}/>
 <h3>Próximas conexiones</h3><p className="caption">Delegación Google Cloud por cliente, Firebase / BigQuery / IAM, Looker Studio Pro y Stripe: pendientes de autorización efectiva y pruebas.</p></section>
}
