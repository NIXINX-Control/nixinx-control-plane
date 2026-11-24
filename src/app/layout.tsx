import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegistration from "@/components/pwa-registration";
export const metadata: Metadata = { title: "NIXINX Control", description: "NIXINX service and entitlement control plane", applicationName:"NIXINX Control", manifest:"/manifest.webmanifest", icons:{apple:[{url:"/apple-touch-icon.png",sizes:"180x180",type:"image/png"}]}, appleWebApp:{capable:true,title:"NIXINX Control",statusBarStyle:"black-translucent"} };
export const viewport: Viewport = {width:"device-width", initialScale:1, viewportFit:"cover", themeColor:"#10182a"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}<PwaRegistration/></body></html>}
