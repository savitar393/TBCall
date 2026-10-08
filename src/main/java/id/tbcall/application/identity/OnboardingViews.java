package id.tbcall.application.identity;

import id.tbcall.persistence.entity.PatientSupporter;
import id.tbcall.persistence.entity.User;
import static id.tbcall.application.identity.OnboardingDtos.*;

final class OnboardingViews {
    private OnboardingViews() {}
    static String email(String value) {
        if(value==null) return null;
        int at=value.indexOf('@');
        return at>0 ? value.substring(0,1)+"***"+value.substring(at) : "***";
    }
    static String phone(String value) {
        if(value==null) return null;
        // Short contact values must also remain masked.
        return value.length()>4 ? "***"+value.substring(value.length()-4) : "***";
    }
    static MaskedAccount account(User user) { return new MaskedAccount(email(user.getEmail()),phone(user.getPhone())); }
    static SupporterDetail detail(PatientSupporter row) {
        User user=row.getLinkedUser();
        LinkedUser linked=user==null ? null : new LinkedUser(user.getId(),email(user.getEmail()),phone(user.getPhone()));
        return new SupporterDetail(row.getId(),row.getTbCase().getId(),row.getSupporterType(),row.getFullName(),
                Boolean.TRUE.equals(row.getActive()),phone(row.getPhone()),linked,row.getVersion());
    }
    static SupporterSummary summary(PatientSupporter row) {
        return new SupporterSummary(row.getId(),row.getSupporterType(),row.getFullName(),Boolean.TRUE.equals(row.getActive()),
                phone(row.getPhone()),row.getLinkedUser()!=null);
    }
}
