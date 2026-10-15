import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";
import provenance from "@/public/geography/hdx-2020/provenance.json";

const asset = provenance.assets.find(a => a.file === "provinces.topo.json")!;
const path = `/geography/hdx-2020/${asset.file}`;
describe("public geometry cache admission", () => {
  it("caches only a pinned public geometry representation", () => {
    const response = proxy(new NextRequest(`https://tbcall.invalid${path}?v=${asset.sha256}`));
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });
  it.each([
    path, `${path}?v=wrong`, `${path}?v=${asset.sha256}&scope=NATIONAL`,
    `${path}?v=${asset.sha256}&v=${asset.sha256}`,
    `/geography/hdx-2020/unknown.topo.json?v=${asset.sha256}`,
    `/geography/hdx-2020/provenance.json?v=${asset.sha256}`,
    `/program-reports?v=${asset.sha256}`, `/api/tbcall/v1/program-reports/summary?v=${asset.sha256}`,
  ])("keeps non-admitted requests private: %s", route => {
    const response = proxy(new NextRequest(`https://tbcall.invalid${route}`));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain("nonce-");
  });
  it("never grants mutation caching", () => {
    const response = proxy(new NextRequest(`https://tbcall.invalid${path}?v=${asset.sha256}`, { method: "POST" }));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
