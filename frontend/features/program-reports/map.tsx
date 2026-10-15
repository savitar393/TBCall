"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus, RotateCcw } from "lucide-react";
import { AppSection, AppState } from "@/components/application-patterns";
import { Button } from "@/components/ui/button";
import type { Geography, Indicator, ReportBundle } from "./api";
import catalogue from "./geometry-index.json";
import { decodeGeometry, type MapFeature as Feature } from "./topology";
import { geometryAssetUrl } from "@/lib/public-geography";

const emptyFeatures: Feature[] = [];
const format = (n: number) => n.toLocaleString("id-ID");
const palette = ["#ccece6", "#99d8c9", "#66c2a4", "#2c9b83", "#006d5b"];
const identities = new Map(catalogue.regions.map(r => [r.code, r]));

function polygonRings(f: Feature) {
  return f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat();
}
function bounds(features: Feature[]) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const f of features) for (const ring of polygonRings(f)) for (const [x, latitude] of ring) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, -latitude); bottom = Math.max(bottom, -latitude);
  }
  const width = Math.max(right - left, 0.001), height = Math.max(bottom - top, 0.001), padding = Math.max(width, height) * 0.04;
  return { x: left - padding, y: top - padding, w: width + padding * 2, h: height + padding * 2 };
}
function path(f: Feature) {
  return polygonRings(f).map(ring => ring.map(([x, latitude], i) => `${i ? "L" : "M"}${x},${-latitude}`).join("") + "Z").join("");
}

/** Geometry is public. Values come exclusively from the current authorized report prop. */
export function ReportingMap({ report, metric, label, unit, onDrill, parent, onBack }: {
  report: ReportBundle; metric: Indicator; label: string; unit: string;
  onDrill(g: Geography): void; parent?: Geography; onBack(): void;
}) {
  const target = report.summary.summary.geography;
  const identity = target.code ? identities.get(target.code) : null;
  // Use the explicit catalogue parent, never a code-prefix geographic inference.
  const file = target.scope === "NATIONAL" ? "provinces" : target.scope === "PROVINCE" ? identity?.code : identity?.parent;
  const scopeKey = `${target.scope}:${target.code ?? ""}`;
  const [loaded, setLoaded] = useState<{ key: string; features: Feature[]; failed: boolean } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 });
  const pattern = useId().replaceAll(":", "");
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    async function load() {
      try {
        if (!file || report.metadata.catalogueVersion !== catalogue.catalogueVersion) throw new Error("Geometry identity unavailable");
        const response = await fetch(geometryAssetUrl(file), { signal: controller.signal });
        if (!response.ok) throw new Error("Geometry unavailable");
        const parsed = decodeGeometry(await response.json());
        const seen = new Set<string>();
        for (const f of parsed.features) {
          const entry = identities.get(f.properties.code);
          if (!entry || seen.has(entry.code) || entry.parent !== f.properties.parent || entry.name !== f.properties.name || (target.scope === "NATIONAL" ? entry.parent !== null : entry.parent !== file)) throw new Error("Geometry identity mismatch");
          seen.add(entry.code);
        }
        const features = target.scope === "REGENCY" ? parsed.features.filter(f => f.properties.code === target.code) : parsed.features;
        if (!features.length) throw new Error("Geometry unavailable");
        if (active) setLoaded({ key: scopeKey, features, failed: false });
      } catch {
        if (active && !controller.signal.aborted) setLoaded({ key: scopeKey, features: [], failed: true });
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [file, scopeKey, target.scope, target.code, report.metadata.catalogueVersion]);
  const features = loaded?.key === scopeKey ? loaded.features : emptyFeatures;
  const shapes = useMemo(() => features.map(f => ({ feature: f, d: path(f) })), [features]);
  const box = useMemo(() => features.length ? bounds(features) : null, [features]);
  const cells = target.scope === "REGENCY" ? [report.summary.summary] : report.breakdown.rows;
  const values = new Map(cells.map(r => [r.geography.code, r]));
  const maximum = Math.max(0, ...cells.map(r => r.indicators[metric]));
  const cuts = [...new Set([1, 2, 3, 4, 5].map(i => Math.ceil(maximum * i / 5)))].filter(n => n > 0);
  function color(value: number | undefined) {
    if (value === undefined) return `url(#${pattern})`;
    if (value === 0) return "#f5f8fa";
    return palette[Math.round(cuts.findIndex(c => value <= c) / Math.max(1, cuts.length - 1) * 4)];
  }
  const activeFeature = features.find(f => f.properties.code === selected);
  const activeValue = activeFeature ? values.get(activeFeature.properties.code)?.indicators[metric] : undefined;
  const unmatched = cells.filter(r => !features.some(f => f.properties.code === r.geography.code));
  const canDrill = (f: Feature) => target.scope !== "REGENCY" && values.has(f.properties.code);
  function drill(f: Feature) { if (canDrill(f)) onDrill(values.get(f.properties.code)!.geography); }
  const view = box ? [box.x + pan.x + box.w * (1 - 1 / zoom) / 2, box.y + pan.y + box.h * (1 - 1 / zoom) / 2, box.w / zoom, box.h / zoom].join(" ") : undefined;
  function move(dx: number, dy: number) {
    if (!box) return;
    const step = Math.max(box.w, box.h) / zoom * 0.15;
    setPan(p => ({ x: Math.max(-box.w / 2, Math.min(box.w / 2, p.x + dx * step)), y: Math.max(-box.h / 2, Math.min(box.h / 2, p.y + dy * step)) }));
  }
  return <AppSection title="Peta wilayah" className="report-map-section" actions={parent && <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft aria-hidden="true" className="size-4" />Kembali ke {parent.name}</Button>}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-foreground">{label}</p><p className="text-xs text-muted-foreground">{target.name} · {unit}</p></div><div className="flex flex-wrap gap-1" role="group" aria-label="Kontrol peta">{zoom > 1 && <><Button size="icon" variant="ghost" aria-label="Geser peta ke kiri" onClick={() => move(-1, 0)}><ChevronLeft aria-hidden="true" /></Button><Button size="icon" variant="ghost" aria-label="Geser peta ke kanan" onClick={() => move(1, 0)}><ChevronRight aria-hidden="true" /></Button><Button size="icon" variant="ghost" aria-label="Geser peta ke atas" onClick={() => move(0, -1)}><ChevronUp aria-hidden="true" /></Button><Button size="icon" variant="ghost" aria-label="Geser peta ke bawah" onClick={() => move(0, 1)}><ChevronDown aria-hidden="true" /></Button></>}<Button size="icon" variant="outline" aria-label="Perkecil peta" disabled={zoom === 1} onClick={() => { const next = Math.max(1, zoom / 1.5); setZoom(next); if (next === 1) setPan({ x: 0, y: 0 }); }}><Minus aria-hidden="true" /></Button><Button size="icon" variant="outline" aria-label="Perbesar peta" disabled={zoom >= 5} onClick={() => setZoom(z => Math.min(5, z * 1.5))}><Plus aria-hidden="true" /></Button><Button size="icon" variant="outline" aria-label="Atur ulang peta" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><RotateCcw aria-hidden="true" /></Button></div></div>
    {loaded?.key !== scopeKey ? <AppState kind="loading" title="Memuat peta…" /> : loaded.failed || !box ? <AppState kind="unavailable" title="Peta belum tersedia">Rincian snapshot tetap tersedia pada peringkat dan tabel.</AppState> : <>
      <div className="report-map-canvas"><svg viewBox={view} role="group" aria-label={`Peta administratif ${target.name}`} tabIndex={0} onKeyDown={e => {
        if (zoom <= 1 || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
        e.preventDefault(); move(e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0, e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0);
      }}>
        <defs><pattern id={pattern} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform={`scale(${box.w / 1000})`}><rect width="6" height="6" fill="#edf0f3" /><path d="M0,0L6,6" stroke="#b2bdc5" strokeWidth="1" /></pattern></defs>
        {shapes.map(({ feature: f, d }) => { const value = values.get(f.properties.code)?.indicators[metric]; const description = `${f.properties.name}: ${value === undefined ? "Data tidak tersedia" : `${format(value)} ${unit}`}`; return <path key={f.properties.code} d={d} role="button" tabIndex={0} aria-label={description} aria-disabled={!canDrill(f)} aria-pressed={selected === f.properties.code} className="report-map-region" fill={color(value)} fillRule="evenodd" vectorEffect="non-scaling-stroke" onPointerEnter={() => setSelected(f.properties.code)} onFocus={() => setSelected(f.properties.code)} onClick={() => drill(f)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); drill(f); } }}><title>{description}</title></path>; })}
      </svg></div>
      <div className="grid gap-3 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="grid min-w-0 gap-1.5 text-xs font-medium">Pilih wilayah<select className="app-input w-full" value={activeFeature?.properties.code ?? ""} onChange={e => setSelected(e.target.value)}><option value="">{target.name}</option>{features.map(f => <option key={f.properties.code} value={f.properties.code}>{f.properties.name}</option>)}</select></label>{activeFeature && canDrill(activeFeature) && <Button size="sm" variant="outline" onClick={() => drill(activeFeature)}>Buka {activeFeature.properties.name}</Button>}</div>
      <div role="status" aria-label="Wilayah dipilih" aria-live="polite" className="flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm"><span className="font-medium">{activeFeature?.properties.name ?? target.name}</span>{activeFeature ? <span className="tabular-nums">{activeValue === undefined ? "Data tidak tersedia" : `${format(activeValue)} ${unit}`}</span> : <span className="text-xs text-muted-foreground">{features.length} {target.scope === "NATIONAL" ? "provinsi" : "kabupaten/kota"}</span>}</div>
      <div aria-label="Legenda peta" className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="report-map-key"><i style={{ background: "#f5f8fa" }} />0</span>{cuts.map((upper, i) => <span key={upper} className="report-map-key"><i style={{ background: color(upper) }} />{format(i ? cuts[i - 1] + 1 : 1)}{upper > (i ? cuts[i - 1] + 1 : 1) ? `–${format(upper)}` : ""}</span>)}<span className="report-map-key"><i className="report-map-unavailable" />Tidak tersedia</span></div>
      {!!unmatched.length && <p role="status" className="text-xs text-amber-800">Geometri belum cocok untuk {unmatched.length} wilayah pada snapshot; nilainya tidak diubah menjadi nol.</p>}
    </>}
    <p className="text-xs leading-relaxed text-muted-foreground">Batas indikatif, bukan penetapan hukum · HDX COD-AB / BPS–OCHA, 2020 · <a className="text-link" href="https://creativecommons.org/licenses/by/3.0/igo/" target="_blank" rel="noreferrer">CC BY 3.0 IGO</a></p>
  </AppSection>;
}
