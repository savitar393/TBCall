// @vitest-environment node
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security/headers";

describe("frontend security policy", () => {
  it("uses production nonce scripts without unsafe-eval, unsafe-inline scripts or wildcards", () => {
    const policy = contentSecurityPolicy("fixture-nonce", false);
    expect(policy).toContain("script-src 'self' 'nonce-fixture-nonce' 'strict-dynamic'");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("connect-src 'self';");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toContain("*");
  });
  it("relaxes only development scripts and websocket connectivity", () => {
    expect(contentSecurityPolicy("nonce", true)).toContain("unsafe-eval");
    expect(contentSecurityPolicy("nonce", true)).toContain("ws:");
    expect(contentSecurityPolicy("nonce", false)).not.toContain("ws:");
  });
  it("sets conservative independent frame, MIME, referrer and device protections", () => {
    const headers = Object.fromEntries(securityHeaders.map(({ key, value }) => [key, value]));
    expect(headers).toMatchObject({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" });
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Permissions-Policy"]).toContain("microphone=()");
    expect(headers["Permissions-Policy"]).toContain("geolocation=()");
  });
});
