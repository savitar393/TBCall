package id.tbcall.application.admin;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import id.tbcall.authorization.CurrentActor.RoleSummary;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.*;
import lombok.Getter;

public final class AdminDtos {
    private AdminDtos() {}
    @Getter
    public static class FacilityInput {
        public enum Field { NAME, TYPE, PARENT, ADDRESS, PROVINCE, REGENCY, DISTRICT, VILLAGE, POSTAL, LATITUDE, LONGITUDE }
        @JsonIgnore private final Set<Field> changedFields=EnumSet.noneOf(Field.class);
        @Size(max=255,message="Nama maksimal 255 karakter.") private String name;
        @Size(max=50,message="Kode jenis fasyankes terlalu panjang.") private String facilityTypeCode;
        private UUID parentFacilityId;
        private String address;
        @Size(max=20,message="Kode provinsi terlalu panjang.") private String provinceCode;
        @Size(max=20,message="Kode kabupaten/kota terlalu panjang.") private String regencyCode;
        @Size(max=20,message="Kode kecamatan terlalu panjang.") private String districtCode;
        @Size(max=20,message="Kode desa/kelurahan terlalu panjang.") private String villageCode;
        @Size(max=10,message="Kode pos terlalu panjang.") private String postalCode;
        @DecimalMin(value="-90",message="Lintang tidak valid.") @DecimalMax(value="90",message="Lintang tidak valid.")
        @Digits(integer=3,fraction=6,message="Presisi lintang maksimal enam desimal.") private BigDecimal latitude;
        @DecimalMin(value="-180",message="Bujur tidak valid.") @DecimalMax(value="180",message="Bujur tidak valid.")
        @Digits(integer=3,fraction=6,message="Presisi bujur maksimal enam desimal.") private BigDecimal longitude;
        public void setName(String value) { name=value; changedFields.add(Field.NAME); }
        public void setFacilityTypeCode(String value) { facilityTypeCode=value; changedFields.add(Field.TYPE); }
        public void setParentFacilityId(UUID value) { parentFacilityId=value; changedFields.add(Field.PARENT); }
        public void setAddress(String value) { address=value; changedFields.add(Field.ADDRESS); }
        public void setProvinceCode(String value) { provinceCode=value; changedFields.add(Field.PROVINCE); }
        public void setRegencyCode(String value) { regencyCode=value; changedFields.add(Field.REGENCY); }
        public void setDistrictCode(String value) { districtCode=value; changedFields.add(Field.DISTRICT); }
        public void setVillageCode(String value) { villageCode=value; changedFields.add(Field.VILLAGE); }
        public void setPostalCode(String value) { postalCode=value; changedFields.add(Field.POSTAL); }
        public void setLatitude(BigDecimal value) { latitude=value; changedFields.add(Field.LATITUDE); }
        public void setLongitude(BigDecimal value) { longitude=value; changedFields.add(Field.LONGITUDE); }
        @JsonAnySetter public void unsupported(String field, Object value) { throw new IllegalArgumentException("Unsupported facility input field"); }
    }
    public record FacilityResponse(UUID id, long version, String name, String facilityTypeCode, UUID parentFacilityId,
            String address, String provinceCode, String regencyCode, String districtCode, String villageCode,
            String postalCode, BigDecimal latitude, BigDecimal longitude, boolean active) {}
    public record FacilitySummary(UUID id, String name, String facilityTypeCode, UUID parentFacilityId,
            String provinceCode, String regencyCode, boolean active) {}
    public record FacilityPage(List<FacilitySummary> content, int page, int size, long totalElements) {}
    public record ReferenceOption(String code, String name) {}
    public record ReferenceData(List<ReferenceOption> facilityTypes, List<ReferenceOption> adminManagedRoles) {}
    public record MembershipInput(Boolean primary) { public boolean primaryRequested() { return Boolean.TRUE.equals(primary); } }
    public record MembershipResponse(UUID userId, UUID facilityId, boolean active, boolean primary) {}
    public record AdminFacilitySummary(UUID id, String name, boolean primary) {}
    public record UserLookupResponse(UUID userId, long version, String email, String phone, String status, boolean emailVerified,
            boolean phoneVerified, List<RoleSummary> roles, List<AdminFacilitySummary> activeFacilities, boolean hasOtherFacilityAssignments) {}
    public record RoleResponse(UUID userId, String roleCode, boolean assigned) {}
    public record StatusResponse(UUID id, String status, long version) {}
}
