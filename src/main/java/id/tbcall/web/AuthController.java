package id.tbcall.web;

import id.tbcall.application.auth.AuthService;
import id.tbcall.application.auth.SessionService;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.security.SecurityProperties;
import id.tbcall.security.SessionAuthenticationFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.web.bind.annotation.*;
import static id.tbcall.application.auth.AuthDtos.*;

@RestController
@RequestMapping("/api/v1")
public class AuthController {
    private final AuthService auth;
    private final SessionService sessions;
    private final SecurityProperties properties;
    private final CookieCsrfTokenRepository csrf;
    public AuthController(AuthService auth, SessionService sessions, SecurityProperties properties, CookieCsrfTokenRepository csrf) {
        this.auth=auth; this.sessions=sessions; this.properties=properties; this.csrf=csrf;
    }
    @PostMapping("/auth/register")
    ResponseEntity<RegistrationResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(201).body(auth.register(request));
    }
    @PostMapping("/auth/verify") VerificationResponse verify(@Valid @RequestBody VerifyRequest request) { return auth.verify(request.token()); }
    @PostMapping("/auth/login")
    ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest input, HttpServletRequest request, HttpServletResponse response) {
        IssuedSession issued=sessions.login(input); csrf.saveToken(null, request, response);
        return ResponseEntity.ok().header("Set-Cookie", cookie(issued.secret(), 8*60*60)).body(issued.response());
    }
    @PostMapping("/auth/logout")
    ResponseEntity<Void> logout(@AuthenticationPrincipal CurrentActor actor, HttpServletRequest request, HttpServletResponse response) {
        sessions.logout(actor); csrf.saveToken(null, request, response);
        return ResponseEntity.noContent().header("Set-Cookie", cookie("", 0)).build();
    }
    @GetMapping("/me") CurrentActor.MeResponse me(@AuthenticationPrincipal CurrentActor actor) { return actor.me(); }
    private String cookie(String secret, long age) {
        return ResponseCookie.from(SessionAuthenticationFilter.COOKIE_NAME, secret).httpOnly(true).secure(properties.isCookieSecure())
                .sameSite("Strict").path("/").maxAge(age).build().toString();
    }
}
