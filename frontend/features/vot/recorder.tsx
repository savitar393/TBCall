"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth/session";
import type { ScheduleOccurrence } from "@/features/medication-schedule/types";
import { votApi, type VotPolicy } from "./api";
const subscribeCapture = () => () => {};
const supportsCapture = () => typeof MediaRecorder !== "undefined" && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

export function VotRecorder({ occurrences, policy, onSaved }: { occurrences: ScheduleOccurrence[]; policy: VotPolicy; onSaved(): void }) {
  const session = useSession();
  const [occurrenceId, setOccurrence] = useState(""), [consent, setConsent] = useState(false), [blob, setBlob] = useState<Blob | null>(null), [preview, setPreview] = useState("");
  const [recording, setRecording] = useState(false), [opening, setOpening] = useState(false), [uploading, setUploading] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const liveVideo = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), recorder = useRef<MediaRecorder | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null), url = useRef(""), alive = useRef(true), controller = useRef<AbortController | null>(null), busy = useRef(false), chunks = useRef<Blob[]>([]), bytes = useRef(0), tooLarge = useRef(false);
  const supported = useSyncExternalStore(subscribeCapture, supportsCapture, () => false);
  function stopTracks() { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (liveVideo.current) liveVideo.current.srcObject = null; if (timer.current) clearTimeout(timer.current); timer.current = null; }
  function releasePreview() { if (url.current) URL.revokeObjectURL(url.current); url.current = ""; }
  function choose(next: Blob) {
    setSaved(false); setError(""); releasePreview(); setBlob(null); setPreview("");
    if (!/^video\/(webm|mp4)(?:;.*)?$/i.test(next.type)) { setError("Pilih video WebM atau MP4."); return; }
    if (!next.size || next.size > policy.maxFileBytes) { setError("Video harus berisi data dan berukuran maksimal 20 MB."); return; }
    url.current = URL.createObjectURL(next); setBlob(next); setPreview(url.current);
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); if (recorder.current) { recorder.current.ondataavailable = null; recorder.current.onstop = null; if (recorder.current.state !== "inactive") recorder.current.stop(); } stream.current?.getTracks().forEach(track => track.stop()); if (timer.current) clearTimeout(timer.current); if (url.current) URL.revokeObjectURL(url.current); }; }, []);
  async function start() {
    if (busy.current || !consent || !supported) return;
    busy.current = true; setOpening(true); setSaved(false); setError("");
    try {
      const captured = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (!alive.current) { captured.getTracks().forEach(track => track.stop()); return; }
      stream.current = captured;
      const mimeType = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) { stopTracks(); setError("Perekaman tidak didukung. Gunakan pilihan berkas video."); return; }
      const instance = new MediaRecorder(captured, { mimeType, videoBitsPerSecond: 1000000 }); recorder.current = instance; chunks.current = []; bytes.current = 0; tooLarge.current = false;
      instance.ondataavailable = event => { if (!alive.current || !event.data.size) return; bytes.current += event.data.size; if (bytes.current > policy.maxFileBytes) { tooLarge.current = true; chunks.current = []; if (instance.state !== "inactive") instance.stop(); } else if (!tooLarge.current) chunks.current.push(event.data); };
      instance.onstop = () => { stopTracks(); if (!alive.current) return; setRecording(false); if (tooLarge.current) setError("Video melebihi 20 MB. Rekam ulang dengan durasi lebih singkat."); else choose(new Blob(chunks.current, { type: instance.mimeType || mimeType })); chunks.current = []; };
      instance.onerror = () => { instance.ondataavailable = null; instance.onstop = null; chunks.current = []; if (instance.state !== "inactive") instance.stop(); stopTracks(); if (alive.current) { setRecording(false); setBlob(null); setError("Perekaman gagal. Silakan pilih berkas video atau coba lagi."); } };
      releasePreview(); setBlob(null); setPreview(""); instance.start(1000); setRecording(true);
      if (liveVideo.current) { liveVideo.current.srcObject = captured; void liveVideo.current.play().catch(() => {}); }
      timer.current = setTimeout(() => { if (instance.state !== "inactive") instance.stop(); }, 60000);
    } catch { stopTracks(); if (alive.current) setError("Izin kamera atau mikrofon tidak tersedia. Periksa izin perangkat atau pilih berkas video."); }
    finally { busy.current = false; if (alive.current) setOpening(false); }
  }
  async function upload() {
    const occurrence = occurrences.find(item => item.id === occurrenceId);
    if (busy.current || !occurrence || !blob || !consent || recording || opening) return;
    busy.current = true; setUploading(true); setProgress(0); setError(""); setSaved(false);
    const active = new AbortController(); controller.current = active;
    try {
      await votApi.upload({ treatmentId: occurrence.treatmentId, occurrenceId, consentPolicyVersion: policy.consentPolicyVersion }, blob, value => { if (alive.current) setProgress(value); }, active.signal);
      if (alive.current && !active.signal.aborted) { releasePreview(); setPreview(""); setBlob(null); setConsent(false); setSaved(true); onSaved(); }
    } catch (failure) { if (alive.current && !active.signal.aborted) { setError("Video belum dapat dikirim. Periksa koneksi, jadwal, atau status unggahan sebelumnya sebelum mencoba kembali."); await session.handleFailure(failure); } }
    finally { busy.current = false; if (alive.current) setUploading(false); }
  }
  const locked = uploading || recording || opening;
  return <div className="space-y-4">
    <p>Demo sintetis saja: jangan merekam pasien atau data nyata. Video digunakan petugas TBC yang berwenang untuk meninjau aktivitas pengobatan dan disimpan selama {policy.retentionDays} hari. Unggahan atau hasil peninjauan tidak otomatis membuktikan kepatuhan, menandai dosis diminum, atau membuat catatan dosis.</p>
    <p>Jika perekaman tidak tersedia, pilih berkas video atau hubungi petugas melalui fasilitas pengobatan Anda. Fitur portal lainnya tetap dapat digunakan.</p>
    <label className="block">Jadwal video<select className="mt-1 min-h-11 w-full rounded border p-2" aria-label="Jadwal video" value={occurrenceId} disabled={locked} onChange={event => { setOccurrence(event.target.value); setConsent(false); setSaved(false); }}><option value="">Pilih kejadian terjadwal</option>{occurrences.map(item => <option key={item.id} value={item.id}>{item.localDate} · {item.localTime} · {item.timeZone}</option>)}</select></label>
    <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-5" checked={consent} disabled={locked} onChange={event => { setConsent(event.target.checked); setSaved(false); }}/><span>Saya menyetujui perekaman dan pengiriman video sintetis ini kepada petugas TBC berwenang sesuai tujuan dan masa simpan di atas, untuk unggahan ini.</span></label>
    {!supported && <p>Perekaman tidak didukung di peramban ini. Gunakan pilihan berkas video.</p>}
    <video ref={liveVideo} aria-label="Kamera langsung" hidden={!recording} muted playsInline className="w-full max-w-lg rounded"/>
    <div className="app-actions">{supported && <Button disabled={!consent || locked} onClick={() => void start()}>Mulai rekam</Button>}{recording && <Button onClick={() => { if (recorder.current?.state !== "inactive") recorder.current?.stop(); }}>Hentikan rekaman</Button>}</div>
    <p className="text-sm">Rekaman dihentikan otomatis setelah sekitar 60 detik. Berkas WebM atau MP4, maksimal 20 MB. Pilih video singkat tanpa data nyata.</p>
    <label className="block">Pilih video<input aria-label="Pilih video" className="mt-1 block w-full" type="file" accept="video/webm,video/mp4" disabled={locked} onChange={event => { const file = event.target.files?.[0]; if (file) choose(file); event.target.value = ""; }}/></label>
    {preview && <video aria-label="Pratinjau video" src={preview} controls playsInline preload="metadata" className="w-full max-w-lg rounded"/>}
    {error && <p role="alert">{error}</p>}{saved && <p role="status">Video berhasil dikirim. Status: Menunggu peninjauan.</p>}
    {uploading && <div role="status"><label>Progres unggahan <progress aria-label="Progres unggahan" max={100} value={progress}/></label><p>{progress}%{progress === 100 ? " · Menunggu konfirmasi server…" : ""}</p><Button variant="outline" onClick={() => { controller.current?.abort(); setUploading(false); setError("Unggahan dihentikan. Periksa riwayat sebelum mencoba kembali."); }}>Hentikan unggahan</Button></div>}
    <Button disabled={!blob || !consent || !occurrences.some(item => item.id === occurrenceId) || locked} onClick={() => void upload()}>Kirim video</Button>
  </div>;
}
