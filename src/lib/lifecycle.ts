export type Lifecycle="pending"|"trial"|"active"|"grace"|"suspended"|"terminated";
export type License={status:Lifecycle;validUntil:string|null;graceDays:number;appId:string;tenantId:string;modules:string[];overrideUntil?:string|null;suspensionAt?:string|null};

export function tenantTimeZone(value:unknown):string|null{
 if(typeof value!=="string"||!value.trim())return null;
 try{return new Intl.DateTimeFormat("en",{timeZone:value.trim()}).resolvedOptions().timeZone;}
 catch{return null;}
}

export function localDayBoundary(at:Date,timeZone:string,days:number):Date{
 const format=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"});
 const day=(time:number)=>{
  const parts=format.formatToParts(new Date(time));
  return ["year","month","day"].map(type=>parts.find(part=>part.type===type)?.value).join("-");
 };
 const [year,month,date]=day(at.getTime()).split("-").map(Number);
 const target=Date.UTC(year,month-1,date+days);
 const key=new Date(target).toISOString().slice(0,10);
 let low=target-36*3600_000,high=target+36*3600_000;
 while(low<high){
  const middle=low+Math.floor((high-low)/2);
  if(day(middle)<key)low=middle+1;
  else high=middle;
 }
 return new Date(low);
}

export function suspensionEffective(value:unknown,at:Date):boolean{
 if(value===undefined||value===null)return false;
 const effective=typeof value==="string"?Date.parse(value):NaN;
 return !Number.isFinite(effective)||at.getTime()>=effective;
}

export function accessDecision(license:License|null,at:Date,requestedModule?:string,timeZone?:string|null){
 if(!license)return {allowed:false,reason:"LICENSE_MISSING"};
 if(["suspended","terminated","pending"].includes(license.status)||suspensionEffective(license.suspensionAt,at))
  return {allowed:false,reason:"SERVICE_DISABLED"};
 if(requestedModule&&!license.modules.includes(requestedModule))return {allowed:false,reason:"MODULE_NOT_LICENSED"};
 if(license.validUntil===null)return {allowed:true,reason:"INDEFINITE"};
 const expires=Date.parse(license.validUntil);
 if(!Number.isFinite(expires))return {allowed:false,reason:"INVALID_EXPIRY"};
 const graceDays=Math.max(0,Math.min(90,license.graceDays));
 const deadline=timeZone&&graceDays>0
  ?localDayBoundary(new Date(expires),timeZone,graceDays+1).getTime()
  :expires+graceDays*86400000;
 const override=license.overrideUntil?Date.parse(license.overrideUntil):NaN;
 const time=at.getTime();
 if(time<=expires)return {allowed:true,reason:"VALID"};
 if(Number.isFinite(override)&&time<=override)return {allowed:true,reason:"AUTHORIZED_EXTENSION"};
 if(graceDays>0&&(timeZone?time<deadline:time<=deadline))return {allowed:true,reason:"GRACE"};
 return {allowed:false,reason:"EXPIRED"};
}

export function permittedTransition(from:Lifecycle,to:Lifecycle){
 const allowed:Record<Lifecycle,Lifecycle[]>={
  pending:["trial","active","terminated"],trial:["active","grace","suspended","terminated"],
  active:["grace","suspended","terminated"],grace:["active","suspended","terminated"],
  suspended:["active","terminated"],terminated:[]
 };
 return allowed[from]?.includes(to)??false;
}
