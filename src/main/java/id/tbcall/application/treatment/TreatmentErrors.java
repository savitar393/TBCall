package id.tbcall.application.treatment;

import id.tbcall.application.common.ApplicationFailure;
import jakarta.persistence.EntityManager;

public final class TreatmentErrors {
    private TreatmentErrors() {}
    public static ApplicationFailure state() {
        return new ApplicationFailure(409,"TREATMENT_STATE_CONFLICT","Status pengobatan tidak sesuai","Status kasus atau pengobatan tidak mengizinkan perubahan ini.");
    }
    public static ApplicationFailure duplicateDose() {
        return new ApplicationFailure(409,"DOSE_EVENT_ALREADY_RECORDED","Laporan dosis sudah dicatat","Anda sudah mencatat laporan untuk pengobatan dan tanggal ini.");
    }
    public static void flush(EntityManager em) {
        try { em.flush(); }
        catch(RuntimeException failure) {
            for(Throwable cause=failure;cause!=null;cause=cause.getCause()) {
                if(cause instanceof org.hibernate.exception.ConstraintViolationException constraint) {
                    if("uq_dose_events_actor_day".equals(constraint.getConstraintName())) throw duplicateDose();
                    if("uq_treatments_one_open_per_case".equals(constraint.getConstraintName())) throw state();
                }
            }
            throw failure;
        }
    }
}
