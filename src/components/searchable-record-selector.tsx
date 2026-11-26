"use client";
import {useId,useState,useEffect,useRef} from "react";
export type RecordOption={id:string;name:string};
export default function SearchableRecordSelector({label,value,onChange,options,disabled=false,required=false,loading=false,error="",hasMore=false,onMore,onReload}:{label:string;value:string;onChange:(id:string)=>void;options:RecordOption[];disabled?:boolean;required?:boolean;loading?:boolean;error?:string;hasMore?:boolean;onMore?:()=>void;onReload?:()=>void}){
 const id=useId(),[query,setQuery]=useState(""),[open,setOpen]=useState(false);
 const selected=options.find(o=>o.id===value),inputRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{inputRef.current?.setCustomValidity(required&&!disabled&&!selected?"Selecciona un registro existente.":"");},[required,disabled,selected]);
 const norm=(v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 const needle=norm(query.trim()),filtered=options.filter(o=>norm(o.id+" "+o.name).includes(needle));
 return <div style={{minWidth:0,marginBottom:10}}><label htmlFor={id}>{label}</label>
 <input ref={inputRef} id={id} aria-required={required} style={{width:"100%",boxSizing:"border-box"}} autoComplete="off" placeholder="Buscar por ID o nombre" value={open?query:selected?selected.id+" - "+selected.name:disabled&&value?value:query} disabled={disabled} aria-expanded={open&&!disabled} aria-controls={id+"-options"} onFocus={()=>{if(!open){setOpen(true);setQuery("");}}} onChange={e=>{setQuery(e.target.value);if(value)onChange("");setOpen(true);}} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();setOpen(false);}if(e.key==="Enter"&&open){e.preventDefault();if(filtered.length===1){onChange(filtered[0].id);setQuery("");setOpen(false);}}}}/>
 {open&&!disabled&&<div id={id+"-options"} style={{border:"1px solid var(--border,#b7c9c1)",borderRadius:8,marginTop:4,padding:6}}><div style={{maxHeight:220,overflowY:"auto"}}>
 {filtered.map(o=><button key={o.id} type="button" className="btn secondary" style={{display:"block",width:"100%",textAlign:"left",whiteSpace:"normal",overflowWrap:"anywhere",marginBottom:4}} onClick={()=>{onChange(o.id);setQuery("");setOpen(false);}}>{o.id} - {o.name}</button>)}
 {!filtered.length&&!loading&&<p className="caption">Sin coincidencias{hasMore?" entre los registros cargados":""}.</p>}</div>
 {loading&&<p role="status">Cargando registros…</p>}{error&&<p className="error" role="alert">{error}</p>}
 {hasMore&&<button className="btn secondary" type="button" disabled={loading} onClick={onMore}>Cargar más registros</button>}
 {onReload&&<button className="btn secondary" type="button" disabled={loading} onClick={onReload}>Actualizar lista</button>}
 <button className="btn secondary" type="button" onClick={()=>setOpen(false)}>Cerrar lista</button></div>}
 {!open&&error&&<p className="error" role="alert">{error}</p>}
 </div>;
}
