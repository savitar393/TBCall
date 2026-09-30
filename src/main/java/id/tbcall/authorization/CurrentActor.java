package id.tbcall.authorization;

import java.util.List;
import java.util.Set;
import java.util.UUID;

public record CurrentActor(UUID userId, UUID sessionId, MeResponse me, Set<String> roleCodes,
        Set<String> permissions, Set<UUID> facilityIds, UUID selfPatientId, Set<UUID> supporterCaseIds) {
    public record RoleSummary(String code, String name) {}
    public record FacilitySummary(UUID id, String name) {}
    public record PatientLinkSummary(UUID id, UUID patientId, long version) {}
    public record MeResponse(UUID id, String email, String phone, String status, List<RoleSummary> roles,
            Set<String> permissions, List<FacilitySummary> activeFacilities, PatientLinkSummary patientLink,
            Set<UUID> supporterCaseIds) {}
    public boolean hasRole(String code) { return roleCodes.contains(code); }
}
