import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { bottleStore } from "../../../lib/bottles/store";
import { bottleInputSchema } from "../../../lib/bottles/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeDeleted = searchParams.get("includeDeleted") === "true";
  const data = bottleStore.list(includeDeleted);
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = bottleInputSchema.parse(body);
    const created = bottleStore.create(payload);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "INVALID_PAYLOAD", issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "UNEXPECTED_ERROR" }, { status: 500 });
  }
}
