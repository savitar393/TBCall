package id.tbcall.application.referral;

import id.tbcall.persistence.entity.*;
import org.springframework.stereotype.Component;
import static id.tbcall.application.referral.ReferralDtos.*;

@Component
public class ReferralViews {
    public Detail detail(Referral referral) {
        TBCase owner=referral.getTbCase(); Patient patient=owner.getRegistration().getPatient(); Treatment t=referral.getTreatment();
        TreatmentSummary summary=t==null ? null : new TreatmentSummary(t.getId(),t.getStatus(),t.getStartDate(),t.getPlannedEndDate(),
                t.getRegimen()==null ? null : t.getRegimen().getCode(),t.getRegimen()==null ? null : t.getRegimen().getName());
        return new Detail(referral.getId(),referral.getVersion(),referral.getReferralType(),referral.getStatus(),referral.getSentAt(),
                referral.getReceivedAt(),referral.getPatientReportedAt(),referral.getCancelledAt(),facility(referral.getSourceFacility()),
                facility(referral.getDestinationFacility()),new PatientDisplay(patient.getId(),patient.getFullName()),
                new CaseDisplay(owner.getId(),owner.getCaseCategoryCode(),owner.getStatus()),summary,referral.getNotes(),referral.getCancelReason(),referral.getReturnReason());
    }
    private FacilityDisplay facility(Facility facility) { return new FacilityDisplay(facility.getId(),facility.getName()); }
}
