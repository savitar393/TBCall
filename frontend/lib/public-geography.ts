import provenance from "@/public/geography/hdx-2020/provenance.json";

// Public shapes only. Never add report responses or account-specific data here.
const assets = new Map(provenance.assets.map(a => [`/geography/hdx-2020/${a.file}`, a.sha256]));

export function geometryAssetUrl(file: string): string {
  const path = `/geography/hdx-2020/${file}.topo.json`;
  const digest = assets.get(path);
  if (!digest) throw new Error("Unknown public geometry");
  return `${path}?v=${digest}`;
}

export function isVersionedPublicGeometry(url: URL, method: string): boolean {
  return (method === "GET" || method === "HEAD") && url.searchParams.size === 1
    && assets.has(url.pathname) && url.searchParams.get("v") === assets.get(url.pathname);
}
