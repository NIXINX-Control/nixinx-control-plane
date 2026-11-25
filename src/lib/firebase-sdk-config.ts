// Read-only Firebase web SDK retrieval; never return provider values to the UI or audit log.
type Binding={projectId:string;projectNumber:string;webAppId:string};
export const sdkKeys=["apiKey","authDomain","projectId","storageBucket","messagingSenderId","appId"] as const;
export function validateSdkRequirements(value:unknown){
 if(!Array.isArray(value)||value.length===0||new Set(value).size!==value.length||value.some(k=>!sdkKeys.some(x=>x===k)))throw Error("FIREBASE_SDK_REQUIREMENTS_INVALID");
 return sdkKeys.filter(k=>value.includes(k));
}
export async function readFirebaseSdkConfig(b:Binding,requirements:unknown,accessToken:string,request:typeof fetch=fetch){
 const required=validateSdkRequirements(requirements);
 if(!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(b.projectId)||!/^[0-9]{1,30}$/.test(b.projectNumber)||!/^1:[0-9]+:web:[a-fA-F0-9]+$/.test(b.webAppId)||b.webAppId.split(":")[1]!==b.projectNumber||typeof accessToken!=="string"||!accessToken||/[\r\n]/.test(accessToken))throw Error("FIREBASE_SDK_INPUT_INVALID");
 let res:Response;
 try{res=await request("https://firebase.googleapis.com/v1beta1/projects/"+b.projectId+"/webApps/"+encodeURIComponent(b.webAppId)+"/config",{method:"GET",headers:{Authorization:"Bearer "+accessToken,Accept:"application/json"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)})}catch{throw Error("FIREBASE_SDK_QUERY_FAILED")}
 if(!res.ok)throw Error(res.status===403?"FIREBASE_SDK_ACCESS_DENIED":res.status===404?"FIREBASE_SDK_NOT_FOUND":"FIREBASE_SDK_QUERY_FAILED");
 let data;try{data=await res.json()}catch{throw Error("FIREBASE_SDK_RESPONSE_INVALID")}
 if(!data||typeof data!=="object"||Array.isArray(data))throw Error("FIREBASE_SDK_RESPONSE_INVALID");
 if(data.projectId!==b.projectId||data.appId!==b.webAppId||(data.messagingSenderId!==undefined&&data.messagingSenderId!==b.projectNumber))throw Error("FIREBASE_SDK_BINDING_MISMATCH");
 const valid=(k:string)=>typeof data[k]==="string"&&data[k].length>0&&data[k].length<=2048&&!/[\s\x00-\x1f\x7f]/.test(data[k]);
 if(!["apiKey","projectId","appId",...required].every(valid))throw Error("FIREBASE_SDK_REQUIRED_FIELDS_MISSING");
 const values:Record<string,string>={};for(const key of required)values[key]=data[key];
 return {evidence:{status:"FIREBASE_SDK_CONFIG_VERIFIED",projectId:b.projectId,webAppId:b.webAppId,verifiedKeys:required,valuesPersisted:false,technicalReady:false,commercialAuthorized:false},values};
}

// Existing UI and audit contract remains metadata-only.
export async function verifyFirebaseSdkConfig(b:Binding,requirements:unknown,accessToken:string,request:typeof fetch=fetch){return (await readFirebaseSdkConfig(b,requirements,accessToken,request)).evidence;}
