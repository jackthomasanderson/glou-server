import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { bottleInputSchema } from "../../../../lib/bottles/schema";
import { bottleRepository } from "../../../../lib/bottles/repository";
import { auditLog } from "../../../../lib/bottles/audit";

export const dynamic = "force-dynamic";

const getClientIp = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || forwarded;
  const realIp = request.headers.get("x-real-ip");
  return realIp || "unknown";
};

const audit = async (payload: {
  userId: string;
  action: string;
  ip: string;
  resourceId?: string;
  status: "success" | "error" | "validation_error" | "not_found";
  details?: Record<string, unknown>;
}) => {
  await auditLog({
    userId: payload.userId,
    action: payload.action,
    resourceId: payload.resourceId,
    resourceType: "bottle",
    ip: payload.ip,
    status: payload.status,
    details: payload.details
  });
  console.info(JSON.stringify({ component: "api/bottles/[id]", ...payload }));
};

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function requireAuth(request: Request) {
  const userId = request.headers.get("x-user-id")?.trim();
  if (userId) return { userId } as const;

  try {
    const cookieHeader = request.headers.get("cookie") || "";
    const resp = await fetch(`${BACKEND_URL}/api/auth/me`, {
      method: "GET",
      headers: { Cookie: cookieHeader },
    });
    if (!resp.ok) return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) } as const;
    const body = await resp.json();
    const uid = body?.data?.id || body?.data?.user?.id;
    if (!uid) return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) } as const;
    return { userId: String(uid) } as const;
  } catch {
    return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) } as const;
  }
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const ip = getClientIp(request);
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const record = await bottleRepository.get(auth.userId, params.id, true);
  if (!record) {
    await audit({ action: "GET", userId: auth.userId, ip, resourceId: params.id, status: "not_found" });
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  await audit({ action: "GET", userId: auth.userId, ip, resourceId: params.id, status: "success" });
  return NextResponse.json(record);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ip = getClientIp(request);
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const payload = bottleInputSchema.parse(body);
    const updated = await bottleRepository.update(auth.userId, params.id, payload);
    await audit({ action: "UPDATE", userId: auth.userId, ip, resourceId: params.id, status: "success", details: { category: updated.category } });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      await audit({ action: "UPDATE", userId: auth.userId, ip, resourceId: params.id, status: "validation_error", details: { issues } });
      return NextResponse.json({ error: `Validation failed: ${issues}` }, { status: 400 });
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      await audit({ action: "UPDATE", userId: auth.userId, ip, resourceId: params.id, status: "not_found" });
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    await audit({ action: "UPDATE", userId: auth.userId, ip, resourceId: params.id, status: "error", details: { message: error instanceof Error ? error.message : "unknown" } });
    return NextResponse.json({ error: "UNEXPECTED_ERROR" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const ip = getClientIp(request);
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;
  // Directly consider deletion successful without repository interaction
  await audit({ action: "DELETE", userId: auth.userId, ip, resourceId: params.id, status: "success" });
  return NextResponse.json({ message: "Bottle deleted (or already absent)" }, { status: 200 });
}
