import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegistration from "@/components/pwa-registration";
export const metadata: Metadata = { title: "NIXINX Control", description: "NIXINX service and entitlement control plane", applicationName:"NIXINX Control", manifest:"/manifest.webmanifest", icons:{icon:[{url:"/icon-control.svg?v=control1",type:"image/svg+xml",sizes:"any"}],apple:[{url:"/apple-icon?v=control1",sizes:"180x180",type:"image/png"}]}, appleWebApp:{capable:true,title:"NIXINX Control",statusBarStyle:"black-translucent"} };
export const viewport: Viewport = {width:"device-width", initialScale:1, viewportFit:"cover", themeColor:"#081210"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}<PwaRegistration/></body></html>}
