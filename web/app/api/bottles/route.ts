import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { bottleInputSchema } from "../../../lib/bottles/schema";
import { bottleRepository } from "../../../lib/bottles/repository";
import { auditLog } from "../../../lib/bottles/audit";

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
  console.info(JSON.stringify({ component: "api/bottles", ...payload }));
};

const requireAuth = (request: Request) => {
  const userId = request.headers.get("x-user-id")?.trim();
  if (!userId) {
    return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) } as const;
  }
  return { userId } as const;
};

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const includeDeleted = searchParams.get("includeDeleted") === "true";
    const data = await bottleRepository.list(auth.userId, includeDeleted);
    await audit({ action: "LIST", userId: auth.userId, ip, status: "success", details: { includeDeleted, count: data.length } });
    return NextResponse.json({ data });
  } catch (error) {
    await audit({
      action: "LIST",
      userId: auth.userId,
      ip,
      status: "error",
      details: { message: error instanceof Error ? error.message : "unknown" }
    });
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const auth = requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const payload = bottleInputSchema.parse(body);
    const created = await bottleRepository.create(auth.userId, payload);
    await audit({ action: "CREATE", userId: auth.userId, ip, resourceId: created.id, status: "success", details: { category: created.category } });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      await audit({ action: "CREATE", userId: auth.userId, ip, status: "validation_error", details: { issues } });
      return NextResponse.json({ error: `Validation failed: ${issues}` }, { status: 400 });
    }
    await audit({ action: "CREATE", userId: auth.userId, ip, status: "error", details: { message: error instanceof Error ? error.message : "unknown" } });
    return NextResponse.json({ error: "UNEXPECTED_ERROR" }, { status: 500 });
  }
}
