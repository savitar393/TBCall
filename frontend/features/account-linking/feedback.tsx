import { ApiError, problemMessage } from "@/lib/api/problem";
export function linkingMessage(error: ApiError, resolving = false): string {
    if (error.problem.status === 404)
        return resolving ? "Tidak ditemukan akun aktif yang memenuhi syarat untuk ditautkan." : "Data tidak ditemukan atau tidak lagi dalam cakupan Anda. Muat ulang dan periksa konteks.";
    if (error.problem.status === 429)
        return "Batas pencarian akun telah tercapai. Tunggu sebelum mencoba kembali secara manual.";
    if (error.problem.code === "INVALID_RESPONSE")
        return "Respons layanan tidak valid. Muat ulang dan periksa kembali sebelum melanjutkan.";
    if (error.problem.status === 409 && error.kind !== "source-authority")
        return "Data atau status tautan telah berubah. Periksa data terbaru dan konfirmasi kembali; tindakan tidak dikirim ulang.";
    if (error.problem.status === 0)
        return "Hasil tindakan belum dapat dipastikan. Muat ulang dan periksa data sebelum mencoba kembali.";
    return problemMessage(error).detail;
}
export function LinkingFeedback({ error, resolving = false }: {
    error: unknown;
    resolving?: boolean;
}) { return error ? <p role="alert" className="text-sm text-destructive">{linkingMessage(error instanceof ApiError ? error : new ApiError({ status: 503, title: "Layanan belum tersedia" }), resolving)}</p> : null; }
