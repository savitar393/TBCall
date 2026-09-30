package id.tbcall.security;

import id.tbcall.application.common.ApplicationFailure;
import java.util.Locale;

public final class IdentityNormalizer {
    private IdentityNormalizer() {}
    public static String email(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.strip().toLowerCase(Locale.ROOT);
        if (normalized.length() > 254 || !normalized.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))
            throw ApplicationFailure.invalid("Alamat email tidak valid.");
        return normalized;
    }
    public static String phone(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.replaceAll("[\\s()\\-]", "");
        if (normalized.startsWith("08")) normalized = "+62" + normalized.substring(1);
        else if (normalized.startsWith("62")) normalized = "+" + normalized;
        if (!normalized.matches("\\+[1-9][0-9]{7,14}"))
            throw ApplicationFailure.invalid("Nomor telepon harus menggunakan format internasional yang valid.");
        return normalized;
    }
    public static String login(String value) {
        if (value == null || value.isBlank()) throw ApplicationFailure.invalid("Identitas login wajib diisi.");
        return value.contains("@") ? email(value) : phone(value);
    }
}
