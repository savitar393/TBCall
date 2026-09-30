package id.tbcall.security;

import java.util.Base64;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class PasswordHasher {
    private static final String PREFIX = "{bcrypt-sha256}";
    private final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder(12);
    private final String dummyHash = encode("Timing comparison password only");
    public String encode(String password) { return PREFIX + bcrypt.encode(prehash(password)); }
    public boolean matches(String password, String stored) {
        if (password == null || stored == null || !stored.startsWith(PREFIX)) {
            bcrypt.matches(prehash(password == null ? "" : password), dummyHash.substring(PREFIX.length()));
            return false;
        }
        return bcrypt.matches(prehash(password), stored.substring(PREFIX.length()));
    }
    private String prehash(String password) { return Base64.getEncoder().encodeToString(SecretTokens.digest(password)); }
}
