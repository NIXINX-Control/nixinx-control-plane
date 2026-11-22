"use client";
import {useEffect,useMemo,useState} from "react";
import type {User} from "firebase/auth";

export type CatalogRow={
  id:string;name?:string;status?:string;description?:string;
  tenantId?:string;appId?:string;moduleId?:string;validUntil?:string;
  graceDays?:number;modules?:string[];verified?:boolean;
};
export type CatalogData={
  tenants:CatalogRow[];apps:CatalogRow[];modules:CatalogRow[];licenses:CatalogRow[];
};
export type CatalogTab="tenants"|"apps"|"modules"|"licenses";

function toLocalInput(iso:string|undefined){
  if(!iso)return "";
  const date=new Date(iso);
  return Number.isFinite(date.getTime())
    ?new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)
    :"";
}
const idPattern=/^[a-z](?:[a-z0-9-]{0,37}[a-z0-9])$/;
function label(row:CatalogRow){return row.name||row.id;}
function friendlyError(error:unknown){return error instanceof Error?error.message:"Error al guardar";}

export default function CatalogManagement({
  tab,user,data,onRefresh,onManageLicense
}:{
  tab:CatalogTab;user:User;data:CatalogData;
  onRefresh:()=>Promise<void>;onManageLicense:(id:string)=>void
}){
  const [mode,setMode]=useState<"new"|"edit"|null>(null);
  const [editing,setEditing]=useState<CatalogRow|null>(null);
  const [draft,setDraft]=useState<Record<string,string>>({});
  const [selectedModules,setSelectedModules]=useState<string[]>([]);
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  useEffect(()=>{setMode(null);setEditing(null);setDraft({});setSelectedModules([]);setReason("");setError("");setMessage("");},[tab]);
  const rows=data[tab]||[];
  const apps=data.apps.filter(a=>a.status!=="archived");
  const tenants=data.tenants.filter(t=>t.status==="active");
  const appModules=useMemo(()=>data.modules.filter(m=>m.appId===draft.appId&&m.status==="active"&&m.verified===true),[data.modules,draft.appId]);
  const licenseId=draft.tenantId&&draft.appId?draft.tenantId+"_"+draft.appId:"";

  function set(key:string,value:string){setDraft(d=>({...d,[key]:value}));}
  function reset(){setMode(null);setEditing(null);setDraft({});setSelectedModules([]);setReason("");setError("");}

  function startNew(){
    setMode("new");setEditing(null);setDraft({graceDays:"0"});setSelectedModules([]);setReason("");setError("");setMessage("");
  }
  function startEdit(row:CatalogRow){
    setMode("edit");setEditing(row);setError("");setMessage("");setReason("");
    setDraft({
      id:tab==="modules"?(row.moduleId||""):row.id,
      name:row.name||"",description:row.description||"",
      appId:row.appId||"",tenantId:row.tenantId||"",
      status:row.status||(tab==="modules"?"active":"active"),
      validUntil:toLocalInput(row.validUntil),
      graceDays:String(row.graceDays||0)
    });
    setSelectedModules(row.modules||[]);
  }

  async function api(path:string,method:string,body:unknown){
    const token=await user.getIdToken();
    const response=await fetch(path,{
      method,cache:"no-store",
      headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify(body)
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||"No se pudo guardar");
    return payload;
  }
  function checkNewId():boolean{
    if(tab==="licenses")return true;
    const id=draft.id||"";
    if(!idPattern.test(id)){setError("El identificador debe contener 2 a 39 caracteres: minúsculas, números o guiones; debe iniciar con letra.");return false;}
    if(tab==="modules"){
      if(!draft.appId){setError("Selecciona la aplicación del módulo.");return false;}
      if(data.modules.some(m=>m.appId===draft.appId&&m.moduleId===id)){setError("Este módulo ya existe para la aplicación.");return false;}
    }else if(rows.some(r=>r.id.toLowerCase()===id.toLowerCase())){
      setError("Este identificador ya existe y es permanente.");return false;
    }
    return true;
  }
  async function save(){
    setError("");setMessage("");
    if(mode==="new"&&!checkNewId())return;
    if(mode==="edit"&&!reason.trim()){setError("Explica el motivo del cambio para auditoría.");return;}
    if(tab==="licenses"){
      if(!draft.tenantId||!draft.appId||!draft.validUntil){setError("Cliente, aplicación y vigencia son obligatorios.");return;}
      const grace=Number(draft.graceDays||0);
      if(!Number.isInteger(grace)||grace<0||grace>90){setError("Los días de gracia deben estar entre 0 y 90.");return;}
      if(selectedModules.some(mid=>!appModules.some(m=>m.moduleId===mid))){
        setError("La licencia contiene un módulo no registrado o inactivo. Corrígelo antes de guardar.");return;
      }
      if(mode==="new"&&rows.some(r=>r.id===licenseId)){setError("Ya existe una licencia para este cliente y aplicación.");return;}
    }
    setBusy(true);
    try{
      if(mode==="new"){
        const body:Record<string,unknown>={kind:tab};
        if(tab==="licenses"){
          body.id=licenseId;body.tenantId=draft.tenantId;body.appId=draft.appId;
          body.validUntil=new Date(draft.validUntil).toISOString();
          body.graceDays=Number(draft.graceDays||0);body.modules=selectedModules;
        }else{
          body.id=draft.id;body.name=draft.name;
          if(tab==="apps")body.description=draft.description||"";
          if(tab==="modules")body.appId=draft.appId;
        }
        await api("/api/admin","POST",body);
      }else if(editing){
        if(tab==="licenses"){
          await api("/api/admin/licenses/"+encodeURIComponent(editing.id),"PATCH",{
            validUntil:new Date(draft.validUntil).toISOString(),
            graceDays:Number(draft.graceDays||0),modules:selectedModules,reason
          });
        }else{
          const path="/api/admin/catalog/"+tab+"/"+encodeURIComponent(editing.id);
          const body:Record<string,unknown>={name:draft.name,status:draft.status,reason};
          if(tab==="apps")body.description=draft.description||"";
          await api(path,"PATCH",body);
        }
      }
      await onRefresh();reset();setMessage("Registro guardado. Los identificadores y relaciones permanecen inmutables.");
    }catch(e){setError(friendlyError(e));}finally{setBusy(false);}
  }

  const tabLabel=tab==="tenants"?"cliente":tab==="apps"?"aplicación":tab==="modules"?"módulo":"licencia";
  return <>
    <div className="row spaced">
      <p className="mutedline">
        {tab==="tenants"?"Empresas con identidad propia y datos segregados":
         tab==="apps"?"Aplicaciones NIXINX con identificador estable":
         tab==="modules"?"Módulos autorizables por aplicación; identificadores vinculados al código":"Licencias y módulos válidos del catálogo"}
      </p>
      <button className="btn" disabled={busy} onClick={startNew}>+ Nuevo</button>
    </div>
    {message&&<p role="status" className="notice">{message}</p>}
    {error&&<p role="alert" className="error">{error}</p>}
    {mode&&<section className="panel">
      <h3 className="subheading">{mode==="edit"?"Editar":"Crear"} {tabLabel}</h3>
      <p className="caption">El identificador es la clave técnica permanente y nunca se renombra. El nombre visible sí puede editarse. Las bajas se archivan, no se eliminan físicamente.</p>
      <form className="fields" onSubmit={e=>{e.preventDefault();void save();}}>
        {tab==="modules"&&<label className="field">Aplicación
          <select required disabled={mode==="edit"||busy} value={draft.appId||""} onChange={e=>{set("appId",e.target.value);setSelectedModules([])}}>
            <option value="">Selecciona una aplicación</option>
            {apps.map(a=><option key={a.id} value={a.id}>{label(a)} ({a.id})</option>)}
          </select>
        </label>}
        {tab==="licenses"&&<>
          <label className="field">Cliente
            <select required disabled={mode==="edit"||busy} value={draft.tenantId||""} onChange={e=>set("tenantId",e.target.value)}>
              <option value="">Selecciona</option>
              {tenants.map(t=><option key={t.id} value={t.id}>{label(t)} ({t.id})</option>)}
            </select>
          </label>
          <label className="field">Aplicación
            <select required disabled={mode==="edit"||busy} value={draft.appId||""} onChange={e=>{set("appId",e.target.value);setSelectedModules([]);}}>
              <option value="">Selecciona</option>
              {apps.map(a=><option key={a.id} value={a.id}>{label(a)} ({a.id})</option>)}
            </select>
          </label>
        </>}
        <label className="field">Identificador técnico (único, permanente)
          <input
            readOnly={mode==="edit"||tab==="licenses"}
            required
            pattern={tab==="licenses"?undefined:"[a-z](?:[a-z0-9-]{0,37}[a-z0-9])"}
            value={tab==="licenses"?licenseId:(draft.id||"")}
            placeholder={tab==="licenses"?"cliente_aplicacion":tab==="modules"?"dashboard":"initiatives"}
            onChange={e=>set("id",e.target.value)}
          />
        </label>
        {tab!=="licenses"&&<>
          <label className="field">Nombre visible (editable)
            <input required maxLength={120} value={draft.name||""} onChange={e=>set("name",e.target.value)} placeholder={tab==="apps"?"Initiatives":tab==="modules"?"Panel de control":"Nombre comercial"}/>
          </label>
          {tab==="apps"&&<label className="field full">Descripción
            <input maxLength={300} value={draft.description||""} onChange={e=>set("description",e.target.value)}/>
          </label>}
          {mode==="edit"&&<label className="field">Estado (baja lógica)
            <select value={draft.status||"active"} onChange={e=>set("status",e.target.value)}>
              {tab==="modules"
                ?<><option value="draft">Borrador</option>{editing?.verified===true&&<option value="active">Activo · manifiesto verificado</option>}<option value="retired">Retirado</option></>
                :<><option value="active">Activo</option><option value="archived">Archivado</option></>}
            </select>
          </label>}
        </>}
        {tab==="licenses"&&<>
          <label className="field">Fin de vigencia
            <input required type="datetime-local" value={draft.validUntil||""} onChange={e=>set("validUntil",e.target.value)}/>
          </label>
          <label className="field">Días de gracia (0–90)
            <input required type="number" min={0} max={90} value={draft.graceDays??"0"} onChange={e=>set("graceDays",e.target.value)}/>
          </label>
          <div className="field full">
            <strong>Módulos registrados en la aplicación</strong>
            <p className="caption">Selecciona módulos reales del catálogo. No se aceptan nombres escritos libremente.</p>
            {appModules.length===0?<p className="caption">No hay módulos verificados por la aplicación. Los módulos registrados manualmente permanecen en borrador hasta validar el manifiesto del código.</p>:
              <div className="stack">
                {appModules.map(m=><label key={m.id} className="row" style={{gap:12}}>
                  <input type="checkbox" checked={selectedModules.includes(m.moduleId||"")} disabled={busy}
                    onChange={e=>setSelectedModules(prev=>e.target.checked?[...prev,m.moduleId!]:prev.filter(mid=>mid!==m.moduleId))}/>
                  <span>{label(m)} <small className="caption">({m.moduleId})</small></span>
                </label>)}
              </div>
            }
            {selectedModules.some(mid=>!appModules.some(m=>m.moduleId===mid))&&
              <p className="error">Existen módulos históricos que no coinciden con el catálogo activo. Corrige la selección.</p>}
          </div>
        </>}
        {mode==="edit"&&<label className="field full">Motivo del mantenimiento (obligatorio)
          <textarea required rows={2} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/>
        </label>}
        <div className="row full">
          <button type="button" className="btn secondary" onClick={reset} disabled={busy}>Cancelar</button>
          <button className="btn" disabled={busy}>{busy?"Guardando…":mode==="edit"?"Guardar cambios":"Crear registro"}</button>
        </div>
      </form>
    </section>}
    <section className="panel">
      <h3 className="subheading">Registros de {tab==="modules"?"módulos":tab==="apps"?"aplicaciones":tab==="tenants"?"clientes":"licencias"}</h3>
      {rows.length?rows.map(row=><div className="item" key={row.id}>
        <div style={{minWidth:0}}>
          <b>{tab==="modules"?label(row):tab==="licenses"?row.id:label(row)}</b>
          <div className="caption">ID: {tab==="modules"?row.moduleId:row.id}
            {row.appId?" · Aplicación: "+row.appId:""}
            {row.tenantId?" · Cliente: "+row.tenantId:""}</div>
          {tab==="modules"&&<div className="caption">Aplicación: {data.apps.find(a=>a.id===row.appId)?.name||row.appId} · Manifiesto: {row.verified?"Verificado":"Pendiente"}</div>}
          {row.validUntil&&<div className="caption">Vigente hasta: {new Date(row.validUntil).toLocaleString("es-CA")} · Gracia: {row.graceDays||0} días · Módulos: {(row.modules||[]).join(", ")||"Ninguno"}</div>}
          {row.status&&<div className="caption">Estado: {row.status}</div>}
        </div>
        <div className="row" style={{flexWrap:"wrap",gap:8}}>
          <button className="btn outline tiny" disabled={busy} onClick={()=>startEdit(row)}>Editar</button>
          {tab==="licenses"&&<button className="btn outline tiny" disabled={busy} onClick={()=>onManageLicense(row.id)}>Estado</button>}
        </div>
      </div>):<p className="empty">Aún no hay registros.</p>}
    </section>
  </>;
}
