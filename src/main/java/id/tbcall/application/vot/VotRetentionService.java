package id.tbcall.application.vot;

import id.tbcall.application.common.AuditService;
import id.tbcall.persistence.entity.VotSubmission;
import jakarta.persistence.*;
import java.io.IOException;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Bounded, idempotent deletion. Metadata and original decisions survive; failed deletes are retried. */
@Service
public class VotRetentionService {
    private final EntityManager em;private final VotProperties properties;private final VotStorage storage;private final AuditService audit;private final Clock clock;
    private record Cursor(OffsetDateTime expiresAt,UUID id) {}
    private Cursor cursor;
    public VotRetentionService(EntityManager em,VotProperties properties,VotStorage storage,AuditService audit,Clock clock){this.em=em;this.properties=properties;this.storage=storage;this.audit=audit;this.clock=clock;}
    @Transactional
    public int cleanup(){
        return cleanup(50);
    }
    @Transactional
    public synchronized int cleanup(int limit){
        if(limit<1 || limit>50)throw new IllegalArgumentException("Retention batch must contain 1–50 records");
        if(!properties.isEnabled())return 0;
        OffsetDateTime now=OffsetDateTime.now(clock);
        var expired=expired(now,limit,cursor);
        if(expired.isEmpty() && cursor!=null){cursor=null;expired=expired(now,limit,null);}
        int count=0;
        for(var v:expired){
            // Advance past failures too, so one inaccessible file cannot indefinitely retain later media.
            // Exhausting the sweep restarts at the oldest remaining candidate on the next call.
            cursor=new Cursor(v.getRetentionExpiresAt(),v.getId());
            try{storage.delete(v.getMediaKey());}catch(IOException retry){continue;}
            v.setMediaDeletedAt(OffsetDateTime.now(clock));v.setUpdatedAt(OffsetDateTime.now(clock));audit.record(null,"VOT_MEDIA_DELETED","VOT_SUBMISSION",v.getId());count++;
        }
        em.flush();return count;
    }
    private List<VotSubmission> expired(OffsetDateTime now,int limit,Cursor after){
        var query=em.createQuery("select v from VotSubmission v where v.mediaDeletedAt is null and v.retentionExpiresAt<=:now"
                +(after==null?"":" and (v.retentionExpiresAt>:afterTime or (v.retentionExpiresAt=:afterTime and v.id>:afterId))")
                +" order by v.retentionExpiresAt,v.id",VotSubmission.class).setParameter("now",now);
        if(after!=null){query.setParameter("afterTime",after.expiresAt());query.setParameter("afterId",after.id());}
        return query.setMaxResults(limit).setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
    }
    @Transactional
    public int cleanupOrphans(){
        if(!properties.isEnabled())return 0;
        // Only old candidates are inspected; a scalar existence lookup avoids loading an unbounded media-key set.
        Set<String> retained=new AbstractSet<>(){
            public boolean contains(Object key){return em.createQuery("select count(v) from VotSubmission v where v.mediaKey=:key",Long.class).setParameter("key",key).getSingleResult()>0;}
            public Iterator<String> iterator(){throw new UnsupportedOperationException();}public int size(){throw new UnsupportedOperationException();}
        };
        try{int deleted=storage.cleanupOrphans(retained,clock.instant().minus(Duration.ofDays(1)),100);
            if(deleted>0)audit.record(null,"VOT_ORPHAN_MEDIA_DELETED","VOT_STORAGE",null);return deleted;
        }catch(IOException retry){return 0;}
    }
}
