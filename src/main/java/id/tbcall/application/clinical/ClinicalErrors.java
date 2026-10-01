package id.tbcall.application.clinical;

import id.tbcall.application.common.ApplicationFailure;
import jakarta.persistence.EntityManager;

public final class ClinicalErrors {
    private ClinicalErrors() {}
    public static ApplicationFailure duplicateIdentity() {
        return new ApplicationFailure(409,"PATIENT_IDENTITY_DUPLICATE","Identitas pasien sudah digunakan",
                "NIK atau nomor BPJS sudah terdaftar. Gunakan pencocokan identitas sebelum membuat registrasi.");
    }
    public static ApplicationFailure ambiguousIdentity() {
        return new ApplicationFailure(409,"PATIENT_IDENTITY_AMBIGUOUS","Identitas pasien belum pasti",
                "Lebih dari satu pasien cocok. Lengkapi konfirmasi identitas sebelum melanjutkan.");
    }
    public static ApplicationFailure reference() {
        return new ApplicationFailure(400,"REFERENCE_CODE_INVALID","Referensi tidak valid","Kode referensi tidak dikenal atau tidak aktif.");
    }
    public static ApplicationFailure state() {
        return new ApplicationFailure(409,"CLINICAL_STATE_CONFLICT","Status data tidak sesuai","Status data tidak mengizinkan perubahan ini.");
    }
    public static void flush(EntityManager em) {
        try { em.flush(); }
        catch(RuntimeException failure) {
            for(Throwable cause=failure;cause!=null;cause=cause.getCause()) {
                if(cause instanceof org.hibernate.exception.ConstraintViolationException constraint
                        && ("uq_patients_nik".equals(constraint.getConstraintName()) || "uq_patients_bpjs".equals(constraint.getConstraintName())))
                    throw duplicateIdentity();
            }
            throw failure;
        }
    }
}
