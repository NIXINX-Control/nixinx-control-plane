/* Network-only PWA worker. No Cache Storage, offline data, API or auth interception. */
self.addEventListener("install",()=>{});
self.addEventListener("activate",()=>{});
self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(event.request.method==="GET"&&url.origin===self.location.origin&&["/icon.svg","/icon-192.png","/icon-512.png","/apple-touch-icon.png","/manifest.webmanifest"].includes(url.pathname)){
    event.respondWith(fetch(event.request));
  }
});
