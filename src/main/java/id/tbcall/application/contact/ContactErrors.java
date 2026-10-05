package id.tbcall.application.contact;

import id.tbcall.application.common.ApplicationFailure;
import jakarta.persistence.EntityManager;
import org.hibernate.exception.ConstraintViolationException;

public final class ContactErrors {
    private ContactErrors() {}
    public static ApplicationFailure state() { return new ApplicationFailure(409,"CONTACT_INVESTIGATION_STATE_CONFLICT","Konflik status investigasi","Status investigasi tidak mengizinkan perubahan ini."); }
    public static ApplicationFailure tptState() { return new ApplicationFailure(409,"TPT_STATE_CONFLICT","Konflik status TPT","Status TPT atau penilaian kelayakan tidak mengizinkan perubahan ini."); }
    public static ApplicationFailure openTpt() { return new ApplicationFailure(409,"TPT_ALREADY_OPEN","TPT masih berjalan","Kontak ini sudah memiliki TPT yang direncanakan atau aktif."); }
    public static ApplicationFailure linked() { return new ApplicationFailure(409,"CONTACT_ALREADY_LINKED","Kontak sudah ditautkan","Tautan pasien yang sudah tersimpan tidak dapat diganti."); }
    public static void flush(EntityManager em) {
        try { em.flush(); } catch(RuntimeException failure) {
            for(Throwable cause=failure;cause!=null;cause=cause.getCause()) if(cause instanceof ConstraintViolationException c) {
                if("uq_preventive_treatment_open_contact".equals(c.getConstraintName())) throw openTpt();
                if("uq_contact_investigation_one_open".equals(c.getConstraintName())) throw state();
            }
            throw failure;
        }
    }
}
