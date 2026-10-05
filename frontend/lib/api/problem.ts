export type ApiProblem = { type?: string; title: string; status: number; detail?: string; code?: string; instance?: string; traceId?: string };
export type ProblemKind = "authentication" | "csrf" | "forbidden" | "stale" | "source-authority" | "precondition" | "unavailable" | "invalid";

export class ApiError extends Error {
  readonly kind: ProblemKind;
  constructor(public readonly problem: ApiProblem, public readonly requestId?: string) {
    super("Permintaan tidak dapat diproses.");
    this.name = "ApiError";
    this.kind = problem.status === 401 ? "authentication"
      : problem.status === 403 && problem.code === "CSRF_INVALID" ? "csrf"
      : problem.status === 403 ? "forbidden"
      : problem.status === 409 && problem.code === "OPTIMISTIC_LOCK_CONFLICT" ? "stale"
      : problem.status === 409 && problem.code === "SOURCE_AUTHORITY_CONFLICT" ? "source-authority"
      : problem.status === 428 ? "precondition"
      : problem.status >= 500 || problem.status === 0 ? "unavailable" : "invalid";
  }
}

export function problemMessage(error: ApiError): { title: string; detail: string } {
  if (error.problem.status === 401 && error.problem.code === "INVALID_CREDENTIALS")
    return { title: "Login tidak berhasil", detail: "Periksa kembali email atau nomor telepon dan kata sandi Anda." };
  switch (error.kind) {
    case "authentication": return { title: "Login diperlukan", detail: "Sesi Anda tidak tersedia atau sudah berakhir. Silakan login kembali." };
    case "csrf": return { title: "Permintaan belum dapat diproses", detail: "Keamanan sesi telah diperbarui. Periksa kembali lalu kirim ulang secara manual." };
    case "forbidden": return { title: "Akses tidak diizinkan", detail: "Akun Anda tidak memiliki akses untuk tindakan ini." };
    case "stale": return { title: "Data telah berubah", detail: "Tampilan dimuat ulang. Periksa data terbaru sebelum mengirim perubahan kembali." };
    case "source-authority": return { title: "Data dikendalikan sumber eksternal", detail: "Data ini hanya dapat dibaca. Perubahan harus melalui alur rekonsiliasi yang disetujui." };
    case "precondition": return { title: "Versi data diperlukan", detail: "Muat ulang data untuk memperoleh versi server sebelum mengirim perubahan." };
    case "unavailable": return { title: "Layanan belum tersedia", detail: "Layanan tidak dapat dihubungi. Silakan coba kembali nanti dan gunakan ID permintaan bila menghubungi petugas." };
    default: return { title: "Permintaan tidak dapat diproses", detail: "Periksa kembali isian dan coba kembali. Jika masalah berlanjut, hubungi petugas dengan ID permintaan." };
  }
}
