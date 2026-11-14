import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "NIXINX Control", description: "NIXINX service and entitlement control plane", applicationName:"NIXINX Control", manifest:"/manifest.webmanifest", appleWebApp:{capable:true,title:"NIXINX Control",statusBarStyle:"black-translucent"} };
export const viewport: Viewport = {width:"device-width", initialScale:1, viewportFit:"cover", themeColor:"#10182a"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}
