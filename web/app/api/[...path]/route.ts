import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

function getForwardCookieHeader(request: NextRequest): string {
  const direct = request.headers.get("cookie");
  if (direct && direct.trim().length > 0) return direct;

  const all = request.cookies.getAll();
  if (!all.length) return "";
  return all.map((c) => `${c.name}=${c.value}`).join("; ");
}

function createProxiedResponse(payload: unknown, backendResponse: Response) {
  const next = NextResponse.json(payload, { status: backendResponse.status });

  // Forward session cookies (critical for auth)
  const headersAny = backendResponse.headers as any;
  const setCookies: string[] =
    typeof headersAny?.getSetCookie === "function"
      ? headersAny.getSetCookie()
      : backendResponse.headers.get("set-cookie")
        ? [backendResponse.headers.get("set-cookie") as string]
        : [];

  for (const cookie of setCookies) {
    next.headers.append("set-cookie", cookie);
  }

  // Forward a few non-sensitive headers that can matter
  const vary = backendResponse.headers.get("vary");
  if (vary) next.headers.set("vary", vary);

  return next;
}

/**
 * Proxy requests to backend API
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const path = params.path.join("/");
    const url = `${BACKEND_URL}/${path}?${request.nextUrl.searchParams.toString()}`;
    const cookieHeader = getForwardCookieHeader(request);

    console.log(`[API Proxy] GET ${url}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
    });

    let data;
    const contentType = response.headers.get("content-type");
    
    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    console.log(`[API Proxy] GET ${url} - Status: ${response.status}`);
    return createProxiedResponse(data, response);
  } catch (error) {
    console.error("[API Proxy] GET error:", error);
    return NextResponse.json(
      { error: "Backend unavailable", details: String(error) },
      { status: 502 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const path = params.path.join("/");
    const rawBody = await request.text();
    const body = rawBody ? JSON.parse(rawBody) : undefined;
    const url = `${BACKEND_URL}/${path}`;
    const cookieHeader = getForwardCookieHeader(request);

    console.log(`[API Proxy] POST ${url}`, body);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let data;
    const contentType = response.headers.get("content-type");
    
    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    console.log(`[API Proxy] POST ${url} - Status: ${response.status}`);
    return createProxiedResponse(data, response);
  } catch (error) {
    console.error("[API Proxy] POST error:", error);
    return NextResponse.json(
      { error: "Backend unavailable", details: String(error) },
      { status: 502 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const path = params.path.join("/");
    const url = `${BACKEND_URL}/${path}`;
    const cookieHeader = getForwardCookieHeader(request);

    console.log(`[API Proxy] DELETE ${url}`);

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
    });

    let data;
    const contentType = response.headers.get("content-type");
    
    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    console.log(`[API Proxy] DELETE ${url} - Status: ${response.status}`);
    return createProxiedResponse(data, response);
  } catch (error) {
    console.error("[API Proxy] DELETE error:", error);
    return NextResponse.json(
      { error: "Backend unavailable", details: String(error) },
      { status: 502 }
    );
  }
}
