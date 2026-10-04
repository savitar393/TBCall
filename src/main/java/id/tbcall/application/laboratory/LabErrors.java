package id.tbcall.application.laboratory;

import id.tbcall.application.common.ApplicationFailure;

public final class LabErrors {
    private LabErrors() {}
    public static ApplicationFailure requestState() { return new ApplicationFailure(409,"LAB_REQUEST_STATE_CONFLICT","Status permintaan tidak sesuai","Status permintaan tidak mengizinkan tindakan ini."); }
    public static ApplicationFailure specimenState() { return new ApplicationFailure(409,"LAB_SPECIMEN_STATE_CONFLICT","Status spesimen tidak sesuai","Spesimen belum dapat diperiksa atau sudah dikonfirmasi penerimaannya."); }
    public static ApplicationFailure resultState() { return new ApplicationFailure(409,"LAB_RESULT_STATE_CONFLICT","Status hasil tidak sesuai","Hasil tidak dapat diubah dalam status permintaan atau pemilik saat ini."); }
    public static ApplicationFailure notLatest() { return new ApplicationFailure(409,"LAB_RESULT_NOT_LATEST","Hasil telah diperbarui","Koreksi hanya dapat dibuat dari hasil terakhir pada pemeriksaan dan spesimen yang sama."); }
    public static ApplicationFailure alreadyExists() { return new ApplicationFailure(409,"LAB_RESULT_ALREADY_EXISTS","Hasil sudah tercatat","Hasil untuk pemeriksaan dan spesimen ini sudah tercatat. Gunakan endpoint /api/v1/lab-results/{resultId}/corrections untuk koreksi jika koreksi masih diizinkan."); }
}
