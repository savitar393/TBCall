package id.tbcall.application.referral;

import id.tbcall.application.common.ApplicationFailure;
import jakarta.persistence.EntityManager;
import org.hibernate.exception.ConstraintViolationException;

public final class ReferralErrors {
    private ReferralErrors() {}
    public static ApplicationFailure state() { return new ApplicationFailure(409,"REFERRAL_STATE_CONFLICT","Konflik status rujukan","Status rujukan, kasus atau pengobatan tidak mengizinkan perubahan ini."); }
    public static ApplicationFailure inflight() { return new ApplicationFailure(409,"REFERRAL_ALREADY_IN_FLIGHT","Rujukan masih berjalan","Kasus ini masih memiliki rujukan yang dikirim atau diterima."); }
    public static ApplicationFailure destination() { return new ApplicationFailure(400,"REFERRAL_DESTINATION_INVALID","Tujuan rujukan tidak valid","Tujuan harus berupa fasyankes aktif yang berbeda dari sumber."); }
    public static ApplicationFailure mismatch() { return new ApplicationFailure(409,"REFERRAL_TREATMENT_MISMATCH","Pengobatan rujukan tidak sesuai","Pengobatan harus aktif, berasal dari kasus ini dan berada di fasyankes sumber."); }
    public static void flush(EntityManager em) {
        try { em.flush(); }
        catch(RuntimeException failure) {
            for(Throwable cause=failure;cause!=null;cause=cause.getCause())
                if(cause instanceof ConstraintViolationException c && "uq_referrals_one_inflight_per_case".equals(c.getConstraintName())) throw inflight();
            throw failure;
        }
    }
}
