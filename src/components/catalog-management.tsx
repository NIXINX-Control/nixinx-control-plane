"use client";
import SearchableRecordSelector from "@/components/searchable-record-selector";
import {NEW_ORGANIZATION_ACRONYM_PATTERN,validNewOrganizationAcronym,validOrganizationAcronymDraft,normalizeOrganizationAcronym} from "@/lib/catalog";
import {useCallback,useEffect,useMemo,useState} from "react";
import type {User} from "firebase/auth";
import {useTenantIdentityCheck,TenantIdentityInfo} from "@/components/tenant-identity-info";

export type CatalogRow={
  id:string;name?:string;status?:string;description?:string;commercialPublished?:boolean;commercialPriceCents?:number;
  timeZone?:string;suspensionAt?:string;servicesSuspensionAt?:string;servicesTerminatedAt?:string;
  tenantId?:string;appId?:string;moduleId?:string;validUntil?:string|null;
  graceDays?:number;modules?:string[];verified?:boolean;
};
export type CatalogData={
  tenants:CatalogRow[];apps:CatalogRow[];modules:CatalogRow[];licenses:CatalogRow[];canEditPrice?:boolean;
};
export type CatalogTab="tenants"|"apps"|"modules"|"licenses";

function toLocalInput(iso:string|null|undefined){
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
  const newOrganization=mode==="new"&&tab==="tenants";
  const identityCheck=useTenantIdentityCheck(user,draft.id||"",newOrganization&&validNewOrganizationAcronym(draft.id));
  const rows=data[tab]||[];
  const apps=data.apps.filter(a=>a.status!=="archived");
  const tenants=data.tenants.filter(t=>t.status==="active");
  const appModules=useMemo(()=>data.modules.filter(m=>m.appId===draft.appId&&m.status==="active"&&m.verified===true),[data.modules,draft.appId]);
  const licenseId=draft.tenantId&&draft.appId?draft.tenantId+"_"+draft.appId:"";

  function set(key:string,value:string){setDraft(d=>({...d,[key]:value}));}
  function reset(){setMode(null);setEditing(null);setDraft({});setSelectedModules([]);setReason("");setError("");}

  function startNew(){
    setMode("new");setEditing(null);setDraft({graceDays:"0",commercialPrice:"0.50"});setSelectedModules([]);setReason("");setError("");setMessage("");
  }
  function startEdit(row:CatalogRow){
    setMode("edit");setEditing(row);setError("");setMessage("");setReason("");
    setDraft({
      id:tab==="modules"?(row.moduleId||""):row.id,
      timeZone:row.timeZone||"",
      name:row.name||"",description:row.description||"",commercialPublished:row.commercialPublished===true?"yes":"no",commercialPrice:((row.commercialPriceCents??50)/100).toFixed(2),
      appId:row.appId||"",tenantId:row.tenantId||"",
      status:row.status||(tab==="modules"?"active":"active"),
      validUntil:toLocalInput(row.validUntil),
      indefinite:row.validUntil===null?"yes":"no",
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
    if(tab==="tenants"&&!validNewOrganizationAcronym(id)){setError("Acrónimo inválido: 2 a 35 caracteres, inicia con letra minúscula ASCII, solo a–z y 0–9.");return false;}
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
    if(mode==="new"&&tab==="tenants"&&identityCheck?.status!=="available"){setError("Verifica primero la disponibilidad del ID.");return;}
    if(mode==="edit"&&!reason.trim()){setError("Explica el motivo del cambio para auditoría.");return;}
    if(tab==="licenses"){
      if(!draft.tenantId||!draft.appId||(draft.indefinite!=="yes"&&!draft.validUntil)){setError("Cliente, aplicación y vigencia son obligatorios.");return;}
      const grace=Number(draft.graceDays||0);
      if(!Number.isInteger(grace)||grace<0||grace>90){setError("Los días de gracia deben estar entre 0 y 90.");return;}
      if(selectedModules.some(mid=>!appModules.some(m=>m.moduleId===mid))){
        setError("La licencia contiene un módulo no registrado o inactivo. Corrígelo antes de guardar.");return;
      }
      if(mode==="new"&&rows.some(r=>r.id===licenseId)){setError("Ya existe una licencia para este cliente y aplicación.");return;}
    }
    if(tab==="apps"&&data.canEditPrice===true&&(!/^\d+(?:\.\d{1,2})?$/.test(draft.commercialPrice||"")||Number(draft.commercialPrice)<0.5||Number(draft.commercialPrice)>999999.99)){setError("Precio CAD inválido (mínimo 0.50).");return;}
    setBusy(true);
    try{
      if(mode==="new"){
        const body:Record<string,unknown>={kind:tab};
        if(tab==="licenses"){
          body.id=licenseId;body.tenantId=draft.tenantId;body.appId=draft.appId;
          body.validUntil=draft.indefinite==="yes"?null:new Date(draft.validUntil).toISOString();
          body.graceDays=Number(draft.graceDays||0);body.modules=selectedModules;
        }else{
          body.id=draft.id;body.name=draft.name;
          if(tab==="apps"){body.description=draft.description||"";body.commercialPublished=draft.commercialPublished==="yes";if(data.canEditPrice===true)body.commercialPriceCents=Math.round(Number(draft.commercialPrice)*100);}
          if(tab==="modules")body.appId=draft.appId;
        }
        await api("/api/admin","POST",body);
      }else if(editing){
        if(tab==="licenses"){
          await api("/api/admin/licenses/"+encodeURIComponent(editing.id),"PATCH",{
            validUntil:draft.indefinite==="yes"?null:new Date(draft.validUntil).toISOString(),
            graceDays:Number(draft.graceDays||0),modules:selectedModules,reason
          });
        }else{
          const path="/api/admin/catalog/"+tab+"/"+encodeURIComponent(editing.id);
          const body:Record<string,unknown>={name:draft.name,status:draft.status,reason};
          if(tab==="apps"){body.description=draft.description||"";body.commercialPublished=draft.commercialPublished==="yes";if(data.canEditPrice===true)body.commercialPriceCents=Math.round(Number(draft.commercialPrice)*100);}
          if(tab==="tenants"&&draft.timeZone?.trim())body.timeZone=draft.timeZone;
          if(tab==="tenants"&&draft.serviceAction)body.serviceAction=draft.serviceAction;
          await api(path,"PATCH",body);
        }
      }
      await onRefresh();reset();setMessage("Registro guardado. Los identificadores y relaciones permanecen inmutables.");
    }catch(e){setError(friendlyError(e));}finally{setBusy(false);}
  }

  async function syncStripe(){
    setBusy(true);setError("");setMessage("");
    try{
      const token=await user.getIdToken();
      const response=await fetch("https://nixinx.com/api/customer-portal/catalog-sync",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:"{}",cache:"no-store"});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||"No se pudo sincronizar Stripe");
      setMessage("Stripe sandbox: "+result.published+" publicados, "+result.archived+" archivados.");
    }catch(e){setError(friendlyError(e));}finally{setBusy(false);}
  }

  const revealEditor=useCallback((element:HTMLElement|null)=>{if(element)element.scrollIntoView({block:"start",behavior:"instant"});},[]);
  const tabLabel=tab==="tenants"?"cliente":tab==="apps"?"aplicación":tab==="modules"?"módulo":"licencia";
  return <>
    <div className="row spaced">
      <p className="mutedline">
        {tab==="tenants"?"Empresas con identidad propia y datos segregados":
         tab==="apps"?"Aplicaciones NIXINX con identificador estable":
         tab==="modules"?"Módulos autorizables por aplicación; identificadores vinculados al código":"Licencias y módulos válidos del catálogo"}
      </p>
      <div className="row">{tab==="apps"&&<button className="btn secondary" disabled={busy} onClick={()=>void syncStripe()}>Sincronizar Stripe (pruebas)</button>}<button className="btn" disabled={busy} onClick={startNew}>+ Nuevo</button></div>
    </div>
    {message&&<p role="status" className="notice">{message}</p>}
    {error&&<p role="alert" className="error">{error}</p>}
    {mode&&<section className="panel" ref={revealEditor}>
      <h3 className="subheading">{mode==="edit"?"Editar":"Crear"} {tabLabel}</h3>
      <p className="caption">El identificador es la clave técnica permanente y nunca se renombra. El nombre visible sí puede editarse. Las bajas se archivan, no se eliminan físicamente.</p>
      <form className="fields" onSubmit={e=>{e.preventDefault();void save();}}>
        {tab==="modules"&&<SearchableRecordSelector required label="Aplicación" disabled={mode==="edit"||busy} value={draft.appId||""} options={apps.map(a=>({id:a.id,name:label(a)}))} onChange={v=>{set("appId",v);setSelectedModules([]);}}/>}
        {tab==="licenses"&&<>
          <SearchableRecordSelector required label="Cliente técnico" disabled={mode==="edit"||busy} value={draft.tenantId||""} options={tenants.map(t=>({id:t.id,name:label(t)}))} onChange={v=>set("tenantId",v)}/>
          <SearchableRecordSelector required label="Aplicación" disabled={mode==="edit"||busy} value={draft.appId||""} options={apps.map(a=>({id:a.id,name:label(a)}))} onChange={v=>{set("appId",v);setSelectedModules([]);}}/>
        </>}
        <label className="field">Identificador técnico (único, permanente)
          <input
            readOnly={mode==="edit"||tab==="licenses"}
            required
            pattern={mode==="edit"||tab==="licenses"?undefined:newOrganization?NEW_ORGANIZATION_ACRONYM_PATTERN:"[a-z](?:[a-z0-9-]{0,37}[a-z0-9])"}
            autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"
            value={tab==="licenses"?licenseId:(draft.id||"")}
            placeholder={tab==="licenses"?"cliente_aplicacion":tab==="modules"?"dashboard":"initiatives"}
            onChange={e=>{const next=newOrganization?normalizeOrganizationAcronym(e.target.value):e.target.value;if(newOrganization&&!validOrganizationAcronymDraft(next)){setError("Acrónimo inválido: solo a–z y 0–9, inicia con letra, máximo 35 caracteres.");return;}set("id",next);if(newOrganization)setError("");}}
            onPaste={e=>{if(!newOrganization)return;const el=e.currentTarget,raw=e.clipboardData.getData("text"),next=el.value.slice(0,el.selectionStart??0)+raw+el.value.slice(el.selectionEnd??el.value.length);if(!validOrganizationAcronymDraft(normalizeOrganizationAcronym(next))){e.preventDefault();setError("Texto pegado rechazado: caracteres inválidos o más de 35 caracteres.");}}}
          />
        </label>
        {newOrganization&&<div className="field full"><p className="caption">Acrónimo obligatorio: 2–35 caracteres, inicia con letra minúscula ASCII; solo a–z y 0–9. Mayúsculas se convierten a minúsculas. Permanente una vez creado.</p>{validNewOrganizationAcronym(draft.id)&&<TenantIdentityInfo id={draft.id||""} check={identityCheck}/>}</div>}
        {tab!=="licenses"&&<>
          <label className="field">Nombre visible (editable)
            <input required maxLength={120} value={draft.name||""} onChange={e=>set("name",e.target.value)} placeholder={tab==="apps"?"Initiatives":tab==="modules"?"Panel de control":"Nombre comercial"}/>
          </label>
          {tab==="apps"&&<label className="field full">Descripción
            <input maxLength={300} value={draft.description||""} onChange={e=>set("description",e.target.value)}/>
          </label>}
          {tab==="apps"&&<><label className="field full">Precio de prueba (CAD)<input readOnly={data.canEditPrice!==true} required type="number" min="0.50" max="999999.99" step="0.01" value={draft.commercialPrice||"0.50"} onChange={e=>set("commercialPrice",e.target.value)}/>{data.canEditPrice!==true&&<small className="caption">Solo superadmin@nixinx.com puede modificar el precio.</small>}</label><label className="row full"><input type="checkbox" checked={draft.commercialPublished==="yes"} onChange={e=>set("commercialPublished",e.target.checked?"yes":"no")}/> Vender en catálogo comercial / Stripe (pruebas)</label></>}
          {tab==="tenants"&&mode==="edit"&&<>
            <label className="field">Zona horaria del cliente<input value={draft.timeZone||""} placeholder="America/Toronto" onChange={e=>set("timeZone",e.target.value)}/></label>
            <label className="field">Acceso para todas las aplicaciones
              <select value={draft.serviceAction||""} onChange={e=>set("serviceAction",e.target.value)}>
                <option value="">Conservar acceso actual</option><option value="active">Reactivar acceso</option>
                <option value="suspended">Suspender a medianoche</option><option value="terminated">Terminar de inmediato</option>
              </select>
            </label>
          </>}
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
            <select aria-label="Tipo de vigencia" value={draft.indefinite||"no"} onChange={e=>set("indefinite",e.target.value)}><option value="no">Hasta una fecha</option><option value="yes">Sin vencimiento</option></select>
            {draft.indefinite!=="yes"&&<input required type="datetime-local" value={draft.validUntil||""} onChange={e=>set("validUntil",e.target.value)}/>}
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
          <button className="btn" disabled={busy||(mode==="new"&&tab==="tenants"&&identityCheck?.status!=="available")}>{busy?"Guardando…":mode==="edit"?"Guardar cambios":"Crear registro"}</button>
        </div>
      </form>
    </section>}
    <section className="panel record-list">
      <h3 className="subheading">Registros de {tab==="modules"?"módulos":tab==="apps"?"aplicaciones":tab==="tenants"?"clientes":"licencias"}</h3>
      {rows.length?rows.map(row=><div className="item" key={row.id}>
        <div style={{minWidth:0}}>
          <b>{tab==="modules"?label(row):tab==="licenses"?row.id:label(row)}</b>
          <div className="record-meta"><div className="caption">ID: {tab==="modules"?row.moduleId:row.id}
            {row.appId?" · Aplicación: "+row.appId:""}
            {row.tenantId?" · Cliente: "+row.tenantId:""}</div>
          {tab==="modules"&&<div className="caption">Aplicación: {data.apps.find(a=>a.id===row.appId)?.name||row.appId} · Manifiesto: {row.verified?"Verificado":"Pendiente"}</div>}
          {row.validUntil===null&&<div className="caption">Sin vencimiento · Módulos: {(row.modules||[]).join(", ")||"Ninguno"}</div>}
          {row.validUntil&&<div className="caption">Vigente hasta: {new Date(row.validUntil).toLocaleString("es-CA")} · Gracia: {row.graceDays||0} días · Módulos: {(row.modules||[]).join(", ")||"Ninguno"}</div>}
          {row.timeZone&&<div className="caption">Zona horaria: {row.timeZone}</div>}
          {(row.suspensionAt||row.servicesSuspensionAt)&&<div className="caption">Suspensión efectiva: {new Date((row.suspensionAt||row.servicesSuspensionAt)!).toLocaleString("es-CA",{timeZone:row.timeZone})}</div>}
          {row.servicesTerminatedAt&&<div className="caption">Servicios del cliente terminados</div>}
          {tab==="apps"&&<div className="caption">Catálogo comercial: {row.commercialPublished===true&&row.status==="active"?"Publicado":"No publicado"} · CAD {((row.commercialPriceCents??50)/100).toFixed(2)}</div>}{row.status&&<div className="caption">Estado: {row.status}</div>}</div>
        </div>
        <div className="record-actions">
          <button className="btn outline tiny" disabled={busy} onClick={()=>startEdit(row)}>Editar</button>
          {tab==="licenses"&&<button className="btn outline tiny" disabled={busy} onClick={()=>onManageLicense(row.id)}>Estado</button>}
        </div>
      </div>):<p className="empty">Aún no hay registros.</p>}
    </section>
  </>;
}
