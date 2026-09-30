package id.tbcall.application.common;

public class ApplicationFailure extends RuntimeException {
    private final int status;
    private final String code;
    private final String title;
    public ApplicationFailure(int status, String code, String title, String detail) {
        super(detail); this.status = status; this.code = code; this.title = title;
    }
    public int status() { return status; }
    public String code() { return code; }
    public String title() { return title; }
    public static ApplicationFailure invalid(String detail) {
        return new ApplicationFailure(400, "VALIDATION_ERROR", "Data tidak valid", detail);
    }
    public static ApplicationFailure conflict(String detail) {
        return new ApplicationFailure(409, "IDENTITY_LINK_CONFLICT", "Konflik tautan akun", detail);
    }
    public static ApplicationFailure optimistic() {
        return new ApplicationFailure(409, "OPTIMISTIC_LOCK_CONFLICT", "Konflik perubahan data",
                "Data telah berubah sejak terakhir dibuka. Muat ulang data sebelum menyimpan kembali.");
    }
    public static ApplicationFailure forbidden() {
        return new ApplicationFailure(403, "ACCESS_DENIED", "Akses ditolak", "Anda tidak memiliki izin dalam lingkup data ini.");
    }
    public static ApplicationFailure missing() {
        return new ApplicationFailure(404, "RESOURCE_NOT_FOUND", "Data tidak ditemukan", "Data yang diminta tidak tersedia.");
    }
}
