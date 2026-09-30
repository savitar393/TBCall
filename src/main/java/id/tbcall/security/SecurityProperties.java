package id.tbcall.security;

import java.time.Duration;
import java.util.List;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter @Setter
@ConfigurationProperties("tbcall.security")
public class SecurityProperties {
    private boolean production = true;
    private boolean exposeVerificationTokens = false;
    private boolean cookieSecure = true;
    private List<String> allowedOrigins = List.of();
    private Duration verificationLifetime = Duration.ofMinutes(30);
    private String bootstrapEmail;
    private String bootstrapPhone;
    private String bootstrapPassword;
}
