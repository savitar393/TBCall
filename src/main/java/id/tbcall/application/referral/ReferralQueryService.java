package id.tbcall.application.referral;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.persistence.entity.Referral;
import jakarta.persistence.EntityManager;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.referral.ReferralDtos.*;
import static id.tbcall.application.referral.ReferralAccess.Side;

@Service
@Transactional(readOnly=true,isolation=Isolation.READ_COMMITTED)
public class ReferralQueryService {
    private final EntityManager em; private final ReferralAccess access; private final ReferralViews views;
    public ReferralQueryService(EntityManager em,ReferralAccess access,ReferralViews views) { this.em=em; this.access=access; this.views=views; }
    public Detail detail(CurrentActor actor,UUID id) { return views.detail(access.existing(actor,id,Side.BOTH,false)); }
    public Page incoming(CurrentActor actor,int page,int size) { return list(actor,Side.DESTINATION,page,size); }
    public Page outgoing(CurrentActor actor,int page,int size) { return list(actor,Side.SOURCE,page,size); }
    private Page list(CurrentActor actor,Side side,int page,int size) {
        access.officer(actor,"REFERRAL_READ");
        if(page<0 || size<1 || size>50 || (long)page*size>Integer.MAX_VALUE) throw ApplicationFailure.invalid("Halaman tidak valid; ukuran halaman harus 1 sampai 50.");
        String where=ReferralAccess.scope(side);
        long count=em.createQuery("select count(r) from Referral r where "+where,Long.class).setParameter("facilities",actor.facilityIds()).getSingleResult();
        var rows=em.createQuery("select r from Referral r where "+where+" order by r.sentAt desc,r.id desc",Referral.class)
                .setParameter("facilities",actor.facilityIds()).setFirstResult(page*size).setMaxResults(size).getResultList();
        return new Page(rows.stream().map(views::detail).toList(),page,size,count);
    }
}
