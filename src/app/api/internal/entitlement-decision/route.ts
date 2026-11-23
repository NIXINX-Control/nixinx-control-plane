import type {NextRequest} from "next/server";
import {handleProductionEntitlement} from "@/lib/corporate-production-entitlement";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export function POST(req:NextRequest){
 return handleProductionEntitlement(req,"decision");
}
