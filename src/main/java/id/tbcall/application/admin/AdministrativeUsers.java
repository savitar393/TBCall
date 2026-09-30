package id.tbcall.application.admin;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.persistence.entity.User;
import jakarta.persistence.*;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class AdministrativeUsers {
    private final EntityManager em;
    public AdministrativeUsers(EntityManager em) { this.em=em; }
    public User lock(UUID id) {
        User user=em.find(User.class,id,LockModeType.PESSIMISTIC_WRITE);
        if(user==null) throw ApplicationFailure.missing(); return user;
    }
    public User activeVerified(UUID id) {
        User user=lock(id);
        if(!"ACTIVE".equals(user.getStatus()) || !verified(user)) throw ApplicationFailure.invalid("Pengguna tujuan harus aktif dan memiliki identitas login terverifikasi.");
        return user;
    }
    public static boolean verified(User user) {
        return (user.getEmail()!=null && user.getEmailVerifiedAt()!=null) || (user.getPhone()!=null && user.getPhoneVerifiedAt()!=null);
    }
}
