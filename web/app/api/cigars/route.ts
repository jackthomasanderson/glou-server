import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Simple placeholder API for cigars — returns empty list for now
export async function GET(request: Request) {
  // auth omitted for prototype; mirror bottles API when ready
  const data: Array<{ id: string; name: string; origin?: string }> = [];
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  // Not implemented yet — return 501
  return NextResponse.json({ error: "NOT_IMPLEMENTED" }, { status: 501 });
}
