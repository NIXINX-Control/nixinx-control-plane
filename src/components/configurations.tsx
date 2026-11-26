"use client";
import SearchableRecordSelector from "@/components/searchable-record-selector";
import {useEffect,useRef,useState} from "react";
import type {User} from "firebase/auth";
import {assignedHostname} from "@/lib/tenant-configuration";
import type {FirebaseWebConfig,TenantConfiguration} from "@/lib/tenant-configuration";
type Item={id:string;name?:string};
type Row=TenantConfiguration&{id:string;status:string};
const fields: {key:keyof FirebaseWebConfig;label:string}[]=[
  {key:"apiKey",label:"NEXT_PUBLIC_FIREBASE_API_KEY"},
  {key:"authDomain",label:"NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"},
  {key:"projectId",label:"NEXT_PUBLIC_FIREBASE_PROJECT_ID"},
  {key:"storageBucket",label:"NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"},
  {key:"messagingSenderId",label:"NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"},
  {key:"appId",label:"NEXT_PUBLIC_FIREBASE_APP_ID"}
];
const blank:FirebaseWebConfig={apiKey:"",authDomain:"",projectId:"",storageBucket:"",messagingSenderId:"",appId:""};
export default function Configurations({user,tenants,apps}:{user:User;tenants:Item[];apps:Item[]}){
  const [rows,setRows]=useState<Row[]>([]),[tenantId,setTenant]=useState(""),[appId,setApp]=useState(""),[firebase,setFirebase]=useState(blank),[orgId,setOrg]=useState(""),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[truncated,setTruncated]=useState(false);
  const editorRef=useRef<HTMLElement>(null);
  let hostname="";try{hostname=assignedHostname(tenantId,appId)}catch{}
  async function request(body?:TenantConfiguration){
    const token=await user.getIdToken();
    const res=await fetch("/api/admin/configurations",{method:body?"POST":"GET",headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store"});
    const data=await res.json();if(!res.ok)throw new Error(data.error||"Error");return data;
  }
  async function load(){setBusy(true);setError("");try{const data=await request();setRows(data.configurations);setTruncated(data.truncated)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  useEffect(()=>{void load()},[user]);
  function reset(){setTenant("");setApp("");setFirebase(blank);setOrg("");setEditing(false)}
  async function save(){
    setBusy(true);setError("");setMessage("");
    try{await request({tenantId,appId,hostname,firebase,...(orgId?{orgId}:{})});reset();await load();setMessage("Configuración guardada como borrador. No habilita el acceso ni modifica Vercel o Firebase del cliente.")}
    catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <>
    <p className="notice">Registra la configuración web de cada cliente y aplicación. No introduzcas claves privadas, contraseñas ni credenciales de servicio. Esta etapa no activa conexiones productivas.</p>
    {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}
    <section className="panel" ref={editorRef}><h3 className="subheading">{editing?"Editar borrador":"Nueva configuración"}</h3>
      <form className="fields" onSubmit={e=>{e.preventDefault();void save()}}>
       <SearchableRecordSelector required label="Cliente técnico" disabled={editing||busy} value={tenantId} options={tenants.map(t=>({id:t.id,name:t.name||t.id}))} onChange={setTenant}/>
       <SearchableRecordSelector required label="Aplicación" disabled={editing||busy} value={appId} options={apps.map(a=>({id:a.id,name:a.name||a.id}))} onChange={setApp}/>
       <label className="field full">Dominio asignado<input readOnly value={hostname} placeholder="cliente.app.nixinx.app"/></label>
       {fields.map(({key,label})=><label className="field" key={key} style={{overflowWrap:"anywhere"}}>{label}<input required autoComplete="off" disabled={busy||(editing&&key==="projectId")} value={firebase[key]} onChange={e=>setFirebase(f=>({...f,[key]:e.target.value.trim()}))}/></label>)}
       <label className="field full">NEXT_PUBLIC_ORG_ID (opcional)<input autoComplete="off" disabled={busy} value={orgId} onChange={e=>setOrg(e.target.value.trim())}/></label>
       <div className="row full"><button type="button" className="btn secondary" onClick={reset} disabled={busy}>Limpiar</button><button className="btn" disabled={busy||!hostname}>Guardar borrador</button></div>
      </form>
    </section>
    <section className="panel"><div className="row"><h3 className="subheading">Configuraciones registradas</h3><button className="btn outline" disabled={busy} onClick={()=>void load()}>Actualizar</button></div>
    {truncated&&<p className="caption">Se muestran las primeras 200 configuraciones. Paginación pendiente.</p>}
    {rows.length?rows.map(row=><div className="item" key={row.id}><div style={{minWidth:0,overflowWrap:"anywhere"}}><b>{row.hostname}</b><div className="caption">{row.tenantId} · {row.appId}</div><div className="caption">Firebase: {row.firebase.projectId} · {row.status}</div></div><button className="btn outline" disabled={busy||row.status!=="draft"} onClick={()=>{setTenant(row.tenantId);setApp(row.appId);setFirebase(row.firebase);setOrg(row.orgId||"");setEditing(true);setMessage("");editorRef.current?.scrollIntoView({block:"start",behavior:"instant"})}}>Editar</button></div>):<p className="empty">Sin configuraciones registradas.</p>}
    </section>
  </>;
}
