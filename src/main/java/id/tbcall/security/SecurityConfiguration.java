package id.tbcall.security;

import id.tbcall.application.auth.BootstrapAdmin;
import id.tbcall.application.auth.SessionService;
import id.tbcall.application.auth.VerificationDeliveryPort;
import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.application.common.AuditService;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.web.ProblemResponses;
import java.net.URI;
import java.time.Clock;
import java.util.List;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableConfigurationProperties(SecurityProperties.class)
public class SecurityConfiguration {
    @Bean org.springframework.security.authentication.AuthenticationManager authenticationManager() {
        // Suppress Boot's unused generated user/password; authentication uses the opaque-session filter only.
        return authentication -> { throw new org.springframework.security.authentication.ProviderNotFoundException("Opaque session authentication required"); };
    }
    @Bean @ConditionalOnMissingBean Clock clock() { return Clock.systemUTC(); }
    @Bean ApplicationRunner bootstrapRunner(BootstrapAdmin admin) { return args -> admin.initialize(); }
    @Bean @ConditionalOnMissingBean
    VerificationDeliveryPort verificationDelivery(SecurityProperties properties) {
        return (purpose, destination, secret, expiry) -> {
            if (!properties.isExposeVerificationTokens()) throw new ApplicationFailure(503, "VERIFICATION_DELIVERY_UNAVAILABLE",
                    "Pengiriman verifikasi belum tersedia", "Pengiriman email atau SMS belum dikonfigurasi. Hubungi administrator.");
            // Explicit dev/test response delivery is handled by AuthService, with no logging/storage here.
        };
    }
    @Bean CookieCsrfTokenRepository csrfRepository(SecurityProperties properties) {
        CookieCsrfTokenRepository repository=CookieCsrfTokenRepository.withHttpOnlyFalse();
        repository.setCookieCustomizer(cookie -> cookie.path("/").secure(properties.isCookieSecure()).sameSite("Strict"));
        return repository;
    }
    @Bean SecurityFilterChain security(HttpSecurity http, SecurityProperties properties, Environment environment,
            SessionService sessions, CookieCsrfTokenRepository csrfRepository, ProblemResponses problems, AuditService audit) throws Exception {
        validate(properties, environment);
        CorsConfiguration cors=new CorsConfiguration(); cors.setAllowedOrigins(properties.getAllowedOrigins());
        cors.setAllowedMethods(List.of("GET", "POST", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Content-Type", "X-XSRF-TOKEN", "If-Match", "X-Request-ID"));
        cors.setExposedHeaders(List.of("ETag", "X-Request-ID")); cors.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source=new UrlBasedCorsConfigurationSource(); source.registerCorsConfiguration("/api/**", cors);
        org.springframework.web.filter.CorsFilter corsFilter=new org.springframework.web.filter.CorsFilter(source);
        corsFilter.setCorsProcessor(new org.springframework.web.cors.DefaultCorsProcessor() {
            @Override protected void rejectRequest(org.springframework.http.server.ServerHttpResponse response) throws java.io.IOException {
                problems.writeCorsRejection(response);
            }
        });
        http.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(c -> c.disable()).formLogin(c -> c.disable()).httpBasic(c -> c.disable()).logout(c -> c.disable())
                .cors(c -> c.disable())
                .csrf(c -> c.spa().csrfTokenRepository(csrfRepository))
                .authorizeHttpRequests(a -> a.requestMatchers("/api/v1/auth/register", "/api/v1/auth/verify", "/api/v1/auth/login").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(e -> e.authenticationEntryPoint((request, response, failure) -> problems.write(
                        new ApplicationFailure(401, "AUTHENTICATION_REQUIRED", "Login diperlukan", "Silakan login untuk mengakses layanan ini."), request, response))
                        .accessDeniedHandler((request, response, failure) -> {
                            var authentication=org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
                            if (authentication!=null && authentication.getPrincipal() instanceof CurrentActor actor) audit.authorizationDenied(actor.userId());
                            problems.write(failure instanceof CsrfException ? new ApplicationFailure(403, "CSRF_INVALID", "Permintaan ditolak",
                                    "Token CSRF tidak tersedia atau tidak valid. Muat ulang sebelum mencoba kembali.") : ApplicationFailure.forbidden(), request, response);
                        }))
                .addFilterAt(corsFilter, org.springframework.web.filter.CorsFilter.class)
                .addFilterBefore(new SessionAuthenticationFilter(sessions, problems), CsrfFilter.class);
        return http.build();
    }
    public static void validate(SecurityProperties properties, Environment environment) {
        boolean production=properties.isProduction() || environment.acceptsProfiles(Profiles.of("prod", "production"));
        if (production && !properties.isCookieSecure()) throw new IllegalStateException("Production cookies must be Secure");
        if (properties.isExposeVerificationTokens() && (production || !environment.acceptsProfiles(Profiles.of("dev", "test"))))
            throw new IllegalStateException("Verification secrets require explicit non-production dev/test configuration");
        if (properties.getVerificationLifetime().isNegative() || properties.getVerificationLifetime().isZero()
                || properties.getVerificationLifetime().compareTo(java.time.Duration.ofHours(24))>0)
            throw new IllegalStateException("Verification lifetime must be positive and at most 24 hours");
        for (String origin:properties.getAllowedOrigins()) {
            URI uri=URI.create(origin);
            if (origin.contains("*") || !("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
                    || uri.getHost()==null || uri.getRawUserInfo()!=null || uri.getRawQuery()!=null || uri.getRawFragment()!=null
                    || (uri.getRawPath()!=null && !uri.getRawPath().isEmpty()))
                throw new IllegalStateException("CORS requires explicit HTTP(S) origins without paths or wildcards");
        }
    }
}
