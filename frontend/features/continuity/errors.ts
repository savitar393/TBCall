import type { ApiError } from "@/lib/api/problem";
const workflowMessages: Record<string, { title: string; detail: string }> = {
  REFERRAL_STATE_CONFLICT: { title: "Status rujukan telah berubah", detail: "Tinjau status rujukan, kasus dan pengobatan terbaru sebelum mengirim ulang." },
  REFERRAL_ALREADY_IN_FLIGHT: { title: "Rujukan masih berjalan", detail: "Kasus ini memiliki rujukan yang dikirim atau diterima. Tinjau rujukan tersebut." },
  REFERRAL_DESTINATION_INVALID: { title: "Tujuan rujukan tidak valid", detail: "Tinjau tujuan aktif yang berbeda dari fasilitas sumber, lalu pilih kembali bila diperlukan." },
  REFERRAL_TREATMENT_MISMATCH: { title: "Episode pengobatan tidak sesuai", detail: "Tinjau episode aktif dan fasilitas sumber dalam persiapan terbaru." },
  CONTACT_INVESTIGATION_STATE_CONFLICT: { title: "Status investigasi telah berubah", detail: "Tinjau status dan fasilitas pelaksana terbaru sebelum mengirim ulang." },
  CONTACT_ALREADY_LINKED: { title: "Kontak sudah ditautkan", detail: "Tautan pasien yang telah tersimpan tidak dapat diganti. Tinjau kontak terbaru." },
  TPT_STATE_CONFLICT: { title: "Status TPT atau kelayakan telah berubah", detail: "Tinjau episode dan penilaian eksplisit terbaru sebelum mengirim ulang." },
  TPT_ALREADY_OPEN: { title: "TPT masih berjalan", detail: "Kontak ini telah memiliki episode TPT yang direncanakan atau aktif. Tinjau riwayat TPT." },
};
export function continuityProblemMessage(error: ApiError) {
  return (error.problem.status === 400 || error.problem.status === 409)
    ? workflowMessages[error.problem.code ?? ""] : undefined;
}
