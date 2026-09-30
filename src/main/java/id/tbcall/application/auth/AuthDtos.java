package id.tbcall.application.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class AuthDtos {
    private AuthDtos() {}
    public record RegisterRequest(@Size(max=254, message="Email terlalu panjang.") String email,
            @Size(max=40, message="Nomor telepon terlalu panjang.") String phone,
            @NotBlank(message="Kata sandi wajib diisi.") @Size(min=12, max=128, message="Kata sandi harus berisi 12–128 karakter.") String password) {}
    public record VerifyRequest(@NotBlank(message="Token wajib diisi.") @Size(max=256, message="Token tidak valid.") String token) {}
    public record LoginRequest(@NotBlank(message="Identitas login wajib diisi.") @Size(max=254, message="Identitas terlalu panjang.") String identity,
            @NotBlank(message="Kata sandi wajib diisi.") @Size(max=128, message="Kata sandi terlalu panjang.") String password) {}
    public record VerificationSecret(String purpose, String token) {}
    public record RegistrationResponse(UUID id, String status, List<VerificationSecret> verificationTokens) {}
    public record VerificationResponse(UUID id, String status) {}
    public record LoginResponse(UUID id, String status, OffsetDateTime expiresAt) {}
    public record RecoveryRequest(@NotBlank(message="Identitas wajib diisi.") @Size(max=254, message="Identitas terlalu panjang.") String identity) {}
    public record ResetConfirmRequest(@NotBlank(message="Token wajib diisi.") @Size(max=256, message="Token tidak valid.") String token,
            @NotBlank(message="Kata sandi wajib diisi.") @Size(min=12, max=128, message="Kata sandi harus berisi 12–128 karakter.") String newPassword) {}
    public record RecoveryResponse(String message) {}
    // Internal application result only; never returned as an HTTP body.
    public record IssuedSession(LoginResponse response, String secret) {}
}
