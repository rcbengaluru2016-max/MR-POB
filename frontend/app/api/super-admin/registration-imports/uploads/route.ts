import { NextRequest } from "next/server";
import { backendApi } from "@/lib/server/backend-api";

export const instant = false;

export async function GET(request: NextRequest) { return backendApi(request); }
