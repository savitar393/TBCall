package id.tbcall.application.identity;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public final class LinkDtos {
    private LinkDtos() {}
    public record LinkRequest(@NotNull(message="ID pengguna wajib diisi.") UUID userId) {}
    public record PatientLinkResponse(UUID id, UUID patientId, UUID userId, String relationshipType,
            String verificationStatus, long version) {}
    public record PatientLinkResult(PatientLinkResponse response, boolean created) {}
    public record SupporterLinkResponse(UUID id, UUID caseId, UUID linkedUserId, long version) {}
}
