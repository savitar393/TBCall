package id.tbcall.application.laboratory;

import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.clinical.ClinicalValidation;
import id.tbcall.persistence.entity.*;
import jakarta.persistence.*;
import java.time.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import static id.tbcall.application.laboratory.LabDtos.*;

@Component
@Transactional(propagation=Propagation.MANDATORY)
public class LabValidation {
    private final EntityManager em;
    private final Clock clock;
    private final ClinicalValidation references;
    public LabValidation(EntityManager em,Clock clock,ClinicalValidation references) { this.em=em; this.clock=clock; this.references=references; }
    public static String text(String value) { return ClinicalValidation.text(value); }
    public void reference(String entity,String code) { references.reference(entity,code,true); }
    public Facility testingFacility(java.util.UUID id) {
        Facility f=em.find(Facility.class,id,LockModeType.PESSIMISTIC_READ);
        if(f==null || !Boolean.TRUE.equals(f.getActive())) throw ApplicationFailure.invalid("Fasyankes pemeriksa harus ada dan aktif."); return f;
    }
    public void notFuture(OffsetDateTime time) { if(time!=null && time.isAfter(OffsetDateTime.now(clock))) throw ApplicationFailure.invalid("Waktu tidak boleh di masa depan."); }
    public void specimen(RecordSpecimen input) {
        if(text(input.specimenType())==null) throw ApplicationFailure.invalid("Jenis spesimen wajib diisi.");
        notFuture(input.collectedAt()); notFuture(input.sentAt());
        if(input.collectedAt()!=null && input.sentAt()!=null && input.sentAt().isBefore(input.collectedAt())) throw ApplicationFailure.invalid("Pengiriman tidak boleh mendahului pengumpulan spesimen.");
    }
    public void receive(LabSpecimen specimen,ReceiveSpecimen input) {
        if(input.receivedAt()==null || input.examinationPossible()==null) throw ApplicationFailure.invalid("Waktu penerimaan dan kelayakan pemeriksaan wajib diisi.");
        notFuture(input.receivedAt());
        if(input.receivedAt().isBefore(specimen.getLabRequest().getRequestedAt())
                || (specimen.getSentAt()!=null && input.receivedAt().isBefore(specimen.getSentAt()))
                || (specimen.getCollectedAt()!=null && input.receivedAt().isBefore(specimen.getCollectedAt())))
            throw ApplicationFailure.invalid("Penerimaan tidak boleh mendahului permintaan, pengumpulan atau pengiriman spesimen.");
        if(!input.examinationPossible() && text(input.rejectionReason())==null) throw ApplicationFailure.invalid("Alasan penolakan spesimen wajib diisi.");
    }
    public void result(OffsetDateTime testedAt,String code,String value,String narrative) {
        if(testedAt==null) throw ApplicationFailure.invalid("Waktu pemeriksaan wajib diisi."); notFuture(testedAt);
        if(text(code)==null && text(value)==null && text(narrative)==null) throw ApplicationFailure.invalid("Isi sekurangnya satu kode, nilai atau narasi hasil pemeriksaan.");
    }
}
