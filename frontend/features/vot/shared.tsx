"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/problem";
import { AppStatusBadge } from "@/components/application-patterns";
import { Button } from "@/components/ui/button";
import { useLocalClock } from "@/lib/use-local-clock";
import { mediaUrl, votStatuses, type VotAudience, type VotSubmission } from "./api";

export function VotReadState({ pending, error, retry }: { pending: boolean; error: unknown; retry(): unknown }) {
  if (pending) return <p role="status">Memuat video…</p>;
  return <div role="alert"><p>{error instanceof ApiError && error.problem.status === 403 ? "Akses video tidak diizinkan." : error instanceof ApiError && error.problem.status === 404 ? "VOT belum tersedia atau rekaman tidak dapat diakses." : "Data video belum dapat dimuat. Silakan coba kembali."}</p><Button variant="outline" onClick={() => void retry()}>Muat ulang video</Button></div>;
}
export function VotFacts({ item }: { item: VotSubmission }) {
  return <><AppStatusBadge>{votStatuses[item.status]}</AppStatusBadge><p>Jadwal: {item.localDate} · {item.localTime} · {item.timeZone}</p><p className="text-sm">Dikirim: {new Date(item.submittedAt).toLocaleString("id-ID")}</p>{item.reviewedAt && <p className="text-sm">Ditinjau: {new Date(item.reviewedAt).toLocaleString("id-ID")}</p>}{item.reviewNotes && <p className="whitespace-pre-wrap break-words">Catatan petugas: {item.reviewNotes}</p>}</>;
}
export function VotPlayback({ audience, item }: { audience: VotAudience; item: VotSubmission }) {
  const [playing, setPlaying] = useState(false), [failed, setFailed] = useState(false), now = useLocalClock();
  if (audience === "staff" && item.status === "CANCELLED") return <p>Pasien membatalkan peninjauan. Pemutaran video oleh petugas tidak lagi tersedia.</p>;
  if (item.mediaDeletedAt || Date.parse(item.retentionExpiresAt) <= now.getTime()) return <p>Video telah kedaluwarsa atau dihapus sesuai masa simpan. Metadata peninjauan tetap tersedia.</p>;
  return <div className="space-y-3"><p className="text-sm">Masa simpan berakhir: {new Date(item.retentionExpiresAt).toLocaleString("id-ID")}</p>{playing ? <video aria-label="Video pengobatan privat" controls playsInline preload="none" src={mediaUrl(audience, item.id)} className="w-full max-w-xl rounded" onError={() => setFailed(true)}/> : <Button variant="outline" onClick={() => setPlaying(true)}>Buka video privat</Button>}{failed && <p role="alert">Video tidak dapat diputar. Akses atau masa simpan mungkin telah berubah. Muat ulang catatan atau hubungi petugas.</p>}</div>;
}
export function useVotCommand() {
  const session = useSession(), client = useQueryClient(), active = useRef<AbortController | null>(null), live = useRef(true), busy = useRef(false);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const snapshot = JSON.stringify(session.user);
  useEffect(() => { live.current = true; return () => { live.current = false; active.current?.abort(); }; }, [snapshot]);
  async function run(operation: (signal: AbortSignal) => Promise<unknown>, success?: () => void) {
    if (busy.current) return;
    const controller = new AbortController(); active.current = controller; busy.current = true; setPending(true); setError("");
    try { await operation(controller.signal); if (!controller.signal.aborted && live.current) { success?.(); await client.invalidateQueries({ queryKey: ["vot"] }); } }
    catch (failure) { if (!controller.signal.aborted && live.current) { setError(failure instanceof ApiError && failure.problem.status === 409 ? "Data telah berubah atau unggahan sudah ada. Muat ulang dan periksa kembali sebelum mengirim." : "Perubahan belum tersimpan. Periksa izin, keadaan video, dan koneksi Anda."); await session.handleFailure(failure); if (failure instanceof ApiError && failure.problem.status === 409) await client.invalidateQueries({ queryKey: ["vot"] }); } }
    finally { busy.current = false; if (!controller.signal.aborted && live.current) setPending(false); }
  }
  return { run, pending, error };
}
