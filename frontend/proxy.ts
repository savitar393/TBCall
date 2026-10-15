import { NextRequest, NextResponse } from "next/server";
import { contentSecurityPolicy } from "@/lib/security/headers";
import { isVersionedPublicGeometry } from "@/lib/public-geography";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", isVersionedPublicGeometry(request.nextUrl, request.method)
    ? "public, max-age=31536000, immutable" : "no-store");
  return response;
}

export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };
