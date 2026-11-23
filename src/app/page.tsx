"use client";
import {useEffect,useRef,useState} from "react";
import {GoogleAuthProvider,onAuthStateChanged,signInWithPopup,signOut,User} from "firebase/auth";
import {auth} from "@/lib/firebase-client";
import Configurations from "@/components/configurations";
import CatalogManagement from "@/components/catalog-management";
import Installations from "@/components/installations";
import {LayoutDashboard,Building2,Boxes,ShieldCheck,ScrollText,LogOut,Plus,RefreshCw,LockKeyhole,ChevronRight,Settings,Puzzle,ServerCog} from "lucide-react";
type RecordItem={id:string;pausedImmediately?:boolean;name?:string;status?:string;description?:string;tenantId?:string;appId?:string;moduleId?:string;validUntil?:string;graceDays?:number;modules?:string[];action?:string;at?:string;actor?:string;target?:string;reason?:string};
type Data={tenants:RecordItem[];apps:RecordItem[];modules:RecordItem[];licenses:RecordItem[];logs:RecordItem[];viewerRole?:"admin"|"superadmin"};
const empty:Data={tenants:[],apps:[],modules:[],licenses:[],logs:[]};type Tab="overview"|"tenants"|"apps"|"modules"|"licenses"|"installations"|"configurations"|"audit";
const tabs=[{id:"overview",title:"Inicio",icon:LayoutDashboard},{id:"tenants",title:"Clientes",icon:Building2},{id:"apps",title:"Aplicaciones",icon:Boxes},{id:"modules",title:"Módulos",icon:Puzzle},{id:"licenses",title:"Licencias",icon:ShieldCheck},{id:"installations",title:"Instalaciones",icon:ServerCog},{id:"configurations",title:"Configuración",icon:Settings},{id:"audit",title:"Auditoría",icon:ScrollText}] as const;
export default function Home(){const authEpoch=useRef(0);const [user,setUser]=useState<User|null>(null),[checked,setChecked]=useState(false),[access,setAccess]=useState<"checking"|"allowed"|"denied"|"error">("checking"),[data,setData]=useState<Data>(empty),[tab,setTab]=useState<Tab>("overview"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[reason,setReason]=useState(""),[transition,setTransition]=useState<string|null>(null);
useEffect(()=>onAuthStateChanged(auth,u=>{authEpoch.current+=1;setUser(u);setChecked(true);setData(empty);setAccess("checking");setTab("overview");setError("")}),[]);
async function request(path:string,method="GET",body?:unknown){if(!user)throw new Error("Inicia sesión");const token=await user.getIdToken();const response=await fetch(path,{method,headers:{"authorization":"Bearer "+token,...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store"});const payload=await response.json();if(!response.ok){const error=new Error(payload.error||"Request failed") as Error&{status?:number};error.status=response.status;throw error;}return payload}
async function load(){if(!user)return;const epoch=authEpoch.current;setBusy(true);try{const result=await request("/api/admin");if(epoch!==authEpoch.current)return;setData(result);setAccess("allowed");setError("")}catch(e){if(epoch!==authEpoch.current)return;const status=(e as Error&{status?:number}).status;setAccess(status===401||status===403?"denied":"error");setData(empty);setError((e as Error).message)}finally{if(epoch===authEpoch.current)setBusy(false)}}
useEffect(()=>{if(user)void load()},[user]);
async function updateLicense(id:string,status:string,validUntil?:string){if(!reason.trim()){setError("Escribe un motivo para auditar este cambio");return}setBusy(true);setError("");try{const replacement=status==="reissue";await request("/api/admin/licenses/"+encodeURIComponent(id),replacement?"POST":"PATCH",replacement?{reason,validUntil}:{status,reason});setTransition(null);setReason("");await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}

if(!checked)return <main className="login"><p className="brand">NIXINX<span> Control</span></p><p className="muted">Comprobando sesión…</p></main>;
if(!user)return <main className="login panel">
  <p className="eyebrow">ADMINISTRACIÓN SEGURA</p>
  <h1 className="brand">NIXINX<span> Control</span></h1>
  <p className="mutedline">Acceso corporativo mediante Google. Solo las cuentas autorizadas por NIXINX podrán utilizar este panel.</p>
  {error&&<p className="error" role="alert">{error}</p>}
  <button className="btn" disabled={busy} onClick={async()=>{
    setBusy(true);setError("");
    try{
      await signInWithPopup(auth,new GoogleAuthProvider());
    }catch(e){
      const error=e as Error&{code?:string};
      if(error.code==="auth/popup-closed-by-user"||error.code==="auth/cancelled-popup-request"){
        setError("Se canceló el acceso con Google.");
      }else if(error.code==="auth/unauthorized-domain"){
        setError("El dominio de esta versión no está autorizado en Firebase Authentication. Solicita autorizar este dominio en el proyecto de Firebase correspondiente.");
      }else if(error.code==="auth/popup-blocked"){
        setError("El navegador bloqueó la ventana de Google. Permite ventanas emergentes para este dominio.");
      }else{
        setError("No fue posible iniciar sesión con Google. Verifica la configuración de autenticación.");
      }
    }finally{setBusy(false)}
  }}>Continuar con Google</button>
  <p className="caption">Iniciar sesión con Google no concede permisos. El servidor verifica el UID y el rol autorizado antes de mostrar información.</p>
</main>;
if(access==="checking")return <main className="login"><p className="brand">NIXINX<span> Control</span></p><p className="muted">Validando autorización de acceso…</p></main>;
if(access==="denied")return <main className="login panel"><h1>Acceso no autorizado</h1><p className="mutedline">Esta cuenta no tiene permisos para utilizar NIXINX Control. Solicite acceso al administrador de NIXINX.</p><button className="btn secondary" onClick={()=>void signOut(auth)}>Cerrar sesión</button></main>;
if(access==="error")return <main className="login panel"><h1>Servicio no disponible</h1><p className="mutedline">No fue posible verificar los permisos de esta cuenta. El acceso permanece bloqueado.</p><button className="btn" disabled={busy} onClick={()=>void load()}>Reintentar</button><button className="btn secondary" onClick={()=>void signOut(auth)}>Cerrar sesión</button></main>;
const navigation=<>{tabs.filter(t=>t.id!=="configurations"||(data.viewerRole==="admin"||data.viewerRole==="superadmin")).map(t=>{const Icon=t.icon;return <button key={t.id} className={tab===t.id?"selected":""} onClick={()=>{setTab(t.id);setError("")}}><Icon size={19}/>{t.title}</button>})}</>;
return <div className="shell"><aside className="side"><div className="brand spaced">NIXINX<span> Control</span></div><div className="eyebrow">CONTROL PLANE</div>{navigation}<div style={{flex:1}}/><button onClick={()=>void signOut(auth)}><LogOut size={18}/> Cerrar sesión</button></aside><main className="main"><header className="top"><div><p className="eyebrow">NIXINX / ADMINISTRACIÓN</p><h1 className="heading">{tabs.find(t=>t.id===tab)?.title}</h1></div><button className="btn secondary" title="Actualizar" onClick={()=>void load()} disabled={busy}><RefreshCw size={17}/></button></header>{error&&<p className="error" role="alert">{error}</p>}{tab==="overview"&&<><section className="panel hero"><p className="eyebrow">SERVICE CONTROL</p><h2 style={{fontSize:24,margin:"8px 0"}}>Un solo lugar para administrar tus servicios.</h2><p className="mutedline">Tenants, aplicaciones, módulos y vigencias. Sin afectar los datos de tus clientes.</p><p className="caption">Rol autorizado: {data.viewerRole==="superadmin"?"Superadministrador NIXINX":"Administrador NIXINX"}. Advanced habilitado; las futuras excepciones de pago serán exclusivas del superadministrador.</p><div className="label-icon"><LockKeyhole size={16} color="#7ce2c4"/><span className="caption">Autorizaciones protegidas en servidor</span></div></section><div className="kpis spaced"><div className="kpi"><strong>{data.tenants.length}</strong><small>Clientes</small></div><div className="kpi"><strong>{data.apps.length}</strong><small>Aplicaciones</small></div><div className="kpi"><strong>{data.licenses.filter(l=>l.status==="active").length}</strong><small>Licencias activas</small></div><div className="kpi"><strong>{data.licenses.filter(l=>l.status==="suspended").length}</strong><small>Suspendidas</small></div></div><section className="panel" style={{marginTop:15}}><h3 className="subheading">Actividad reciente</h3>{data.logs.length?data.logs.slice(0,6).map((a,i)=><div className="item" key={a.id||i}><div><b className="tiny">{a.action}</b><div className="caption">{a.target} · {a.at?.slice(0,16).replace("T"," ")}</div></div><ChevronRight size={17}/></div>):<div className="empty">Sin operaciones registradas.</div>}</section></>}
{(["tenants","apps","modules","licenses"] as Tab[]).includes(tab)&&<CatalogManagement tab={tab as "tenants"|"apps"|"modules"|"licenses"} user={user} data={data} onRefresh={load} onManageLicense={id=>{setTransition(id);setReason("");}}/>}
{tab==="installations"&&<Installations user={user} tenants={data.tenants}/>}
{tab==="configurations"&&(data.viewerRole==="admin"||data.viewerRole==="superadmin")&&<Configurations user={user} tenants={data.tenants} apps={data.apps}/>}
{tab==="audit"&&<section className="panel"><h3 className="subheading">Eventos auditados</h3>{data.logs.length?data.logs.map((a,i)=><div className="item" key={a.id||i}><div><b>{a.action}</b><div className="caption">{a.target} · {a.actor}</div><div className="caption">{a.at}</div></div></div>):<div className="empty">Todavía no hay eventos.</div>}</section>}
{transition&&<form key={transition} className="panel" aria-label="Cambiar estado de licencia" onSubmit={event=>{
  event.preventDefault();
  const expiry=new FormData(event.currentTarget).get("replacementExpiry");
  void updateLicense(transition,"reissue",typeof expiry==="string"&&expiry?new Date(expiry).toISOString():undefined);
}}>
  <h3 className="subheading">Autorizar cambio de licencia</h3>
  <p className="caption">Licencia: {transition}. Esta acción quedará registrada en auditoría.</p>
  <label className="field">Motivo obligatorio<textarea required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} rows={3}/></label>
  {data.licenses.find(license=>license.id===transition)?.status==="terminated"&&<>
    <p className="caption">La licencia terminada se conserva en el historial. La nueva licencia se emite para el mismo cliente y aplicación.</p>
    <label className="field">Nuevo vencimiento (opcional si la vigencia anterior sigue válida o era indefinida)
      <input name="replacementExpiry" type="datetime-local"/>
    </label>
  </>}
  <div className="row" style={{flexWrap:"wrap",marginTop:15}}>
    {data.licenses.find(license=>license.id===transition)?.status==="terminated"
      ?<button type="submit" className="btn" disabled={busy||!reason.trim()}>Emitir nueva licencia y reactivar</button>
      :(["active","grace","suspended",data.licenses.find(license=>license.id===transition)?.pausedImmediately?"resume_now":"pause_now","terminated"] as const).map(status=><button type="button" key={status} disabled={busy||!reason.trim()} className={status==="terminated"?"btn outline":"btn secondary"} onClick={()=>void updateLicense(transition,status)}>{status==="terminated"?"Terminar (irreversible)":status==="pause_now"?"Pausar inmediatamente":status==="resume_now"?"Reactivar inmediatamente":status}</button>)}
    <button type="button" className="btn outline" onClick={()=>setTransition(null)}>Cerrar</button>
  </div>
</form>}
<p className="caption" style={{marginTop:28}}>NIXINX Control • Administración por UID • Sin cobros ni pagos conectados</p></main><nav className="nav" aria-label="Navegación">{navigation}</nav></div>
}