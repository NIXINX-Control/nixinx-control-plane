// Catalog references are immutable. Names may be updated without breaking licenses.
// New IDs are DNS-safe lowercase slugs. Existing legacy IDs remain unchanged.
export const NEW_ID_PATTERN=/^[a-z](?:[a-z0-9-]{0,37}[a-z0-9])$/;
export const MODULE_ID_PATTERN=/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])$/;
export const MAX_LICENSE_MODULES=100;

export function isNewCatalogId(value:unknown):value is string {
  return typeof value==="string" && NEW_ID_PATTERN.test(value);
}

export function appModuleDocId(appId:string,moduleId:string):string {
  return appId+"."+moduleId;
}

export function normalizeSelectedModules(value:unknown):string[] {
  if(!Array.isArray(value)||value.length>MAX_LICENSE_MODULES)throw new Error("Invalid module selection");
  const selected:string[]=[];
  for(const id of value){
    if(typeof id!=="string"||!MODULE_ID_PATTERN.test(id)||selected.includes(id))throw new Error("Invalid or repeated module identifier");
    selected.push(id);
  }
  return selected;
}

export function validateSelectedModules(
  ids:readonly string[],
  appId:string,
  records:ReadonlyArray<{appId?:unknown;moduleId?:unknown;status?:unknown;verified?:unknown}|null|undefined>
):void {
  if(ids.length!==records.length)throw new Error("Module selection could not be validated");
  for(let i=0;i<ids.length;i++){
    const entry=records[i];
    if(!entry || entry.appId!==appId || entry.moduleId!==ids[i] || (entry.status!=="active" || entry.verified!==true)){
      throw new Error("Module not registered and active in this application");
    }
  }
}

export function acceptsCatalogStatus(kind:"tenants"|"apps"|"modules",status:unknown):boolean{
  return kind==="modules"?status==="draft"||status==="active"||status==="retired":status==="active"||status==="archived";
}

// New organization identity only. Existing catalog IDs and P03 contracts are unchanged.
export const NEW_ORGANIZATION_ACRONYM_PATTERN="[a-z][a-z0-9]{1,34}";
export function validNewOrganizationAcronym(value:unknown):value is string{
 return typeof value==="string"&&value.length>=2&&value.length<=35&&/^[a-z]/.test(value)&&!/[^a-z0-9]/.test(value);
}
export function validOrganizationAcronymDraft(value:string):boolean{
 return value===""||(value.length<=35&&/^[a-z]/.test(value)&&!/[^a-z0-9]/.test(value));
}
