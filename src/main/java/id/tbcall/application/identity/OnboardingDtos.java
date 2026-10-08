package id.tbcall.application.identity;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import java.util.List;
import java.util.UUID;

/** Deliberate onboarding projections: persistence entities never cross the HTTP boundary. */
public final class OnboardingDtos {
    private OnboardingDtos() {}
    public record ResolveInput(String identity) {
        @JsonAnySetter public void unsupported(String name,Object value) { reject(); }
    }
    public record SupporterInput(String supporterType,String fullName,String phone) {
        @JsonAnySetter public void unsupported(String name,Object value) { reject(); }
    }
    private static void reject() { throw new IllegalArgumentException("Unsupported onboarding field"); }
    public record MatchedLogin(String kind,String maskedValue) {}
    public record Candidate(UUID userId,MatchedLogin matchedLogin) {}
    public record MaskedAccount(String maskedEmail,String maskedPhone) {}
    public record LinkedUser(UUID userId,String maskedEmail,String maskedPhone) {}
    public record PatientLinkState(UUID id,UUID patientId,UUID userId,String relationshipType,
            String verificationStatus,MaskedAccount maskedAccount) {}
    public record PatientState(PatientLinkState link) {}
    public record Pair(UUID id,String verificationStatus) {}
    public record PairState(UUID patientId,UUID userId,Pair pair) {}
    // Versions accompanying patient GETs are used only for HTTP ETags, not the state projection.
    public record Versioned<T>(T value,Long version) {}
    public record SupporterSummary(UUID id,String supporterType,String fullName,boolean active,String maskedPhone,boolean linked) {}
    public record SupporterPage(List<SupporterSummary> content,int page,int size,long totalElements) {}
    public record SupporterDetail(UUID id,UUID caseId,String supporterType,String fullName,boolean active,
            String maskedPhone,LinkedUser linkedUser,long version) {}
}
