import { NextRequest } from "next/server";
import { backendApi } from "@/lib/server/backend-api";

export const instant = false;

export async function POST(request: NextRequest) { return backendApi(request); }
