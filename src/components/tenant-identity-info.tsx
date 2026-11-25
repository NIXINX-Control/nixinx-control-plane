"use client";
import {useEffect,useState} from "react";
import type {User} from "firebase/auth";
import {newTenantId} from "@/lib/tenant-identity-precheck";
type Check={id:string;status:"checking"|"available"|"blocked";reason?:string};
const labels:Record<string,string>={TENANT_ID_ALREADY_EXISTS:"El ID ya pertenece a un cliente.",TENANT_ID_RESERVED_BY_INTAKE:"El ID ya tiene un expediente. Recupera el existente.",TENANT_DNS_ALREADY_REGISTERED:"El identificador DNS ya está registrado.",TENANT_DOMAIN_CONFLICT:"Existe un conflicto de dominio en Control.",IDENTITY_INVENTORY_LIMIT_REVIEW_REQUIRED:"No se pudo completar la revisión del catálogo."};
export function useTenantIdentityCheck(user:User,id:string,enabled:boolean){
 const [result,setResult]=useState<Check|null>(null);
 useEffect(()=>{
  if(!enabled||!newTenantId.test(id))return;
  let active=true;const controller=new AbortController();
  const timer=setTimeout(()=>{void (async()=>{try{
   const r=await fetch("/api/admin/catalog/tenant-identity?id="+encodeURIComponent(id),{headers:{authorization:"Bearer "+await user.getIdToken()},cache:"no-store",signal:controller.signal});
   const d=await r.json();
   if(active)setResult({id,status:r.ok&&d.status==="AVAILABLE_IN_CONTROL"?"available":"blocked",reason:r.ok?undefined:d.error});
  }catch{if(active)setResult({id,status:"blocked",reason:"VALIDATION_UNAVAILABLE"})}})()},350);
  return()=>{active=false;clearTimeout(timer);controller.abort()};
 },[user,id,enabled]);
 return !enabled||!newTenantId.test(id)?null:result?.id===id?result:{id,status:"checking" as const};
}
export function TenantIdentityInfo({id,appId,check}:{id:string;appId?:string;check:Check|null}){
 if(!id)return null;
 if(!newTenantId.test(id))return <p className="error">ID inválido: utiliza minúsculas, números y guiones.</p>;
 return <div style={{overflowWrap:"anywhere"}}><p className="caption">Hostname {appId?"resultante":"por aplicación"}: {id+"."+(appId||"[aplicación]")+".nixinx.app"}</p><p className={check?.status==="blocked"?"error":"caption"}>{check?.status==="available"?"ID disponible en Control. DNS externo pendiente de validación antes de instalar.":check?.status==="blocked"?labels[check.reason||""]||"No se pudo verificar la disponibilidad del ID.":"Comprobando disponibilidad en Control…"}</p></div>;
}
