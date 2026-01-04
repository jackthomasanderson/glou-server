import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { bottleStore, BottleStoreError } from "../../../../lib/bottles/store";
import { bottleInputSchema } from "../../../../lib/bottles/schema";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const record = bottleStore.list(true).find((item) => item.id === params.id);
  if (!record) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ data: record });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const payload = bottleInputSchema.parse(body);
    const updated = bottleStore.update(params.id, payload);
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      return NextResponse.json({ error: `Validation failed: ${issues}` }, { status: 400 });
    }
    if (error instanceof BottleStoreError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "UNEXPECTED_ERROR" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const deleted = bottleStore.softDelete(params.id);
    return NextResponse.json({ data: deleted });
  } catch (error) {
    if (error instanceof BottleStoreError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "UNEXPECTED_ERROR" }, { status: 500 });
  }
}
