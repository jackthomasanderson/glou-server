import { NextResponse } from "next/server";
import { bottleStore, BottleStoreError } from "../../../../../lib/bottles/store";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const restored = bottleStore.restore(params.id);
    return NextResponse.json({ data: restored });
  } catch (error) {
    if (error instanceof BottleStoreError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "UNEXPECTED_ERROR" }, { status: 500 });
  }
}
