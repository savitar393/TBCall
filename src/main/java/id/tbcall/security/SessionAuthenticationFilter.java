package id.tbcall.security;

import id.tbcall.application.auth.SessionService;
import id.tbcall.application.common.ApplicationFailure;
import id.tbcall.authorization.CurrentActor;
import id.tbcall.web.ProblemResponses;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class SessionAuthenticationFilter extends OncePerRequestFilter {
    public static final String COOKIE_NAME="TBCALL_SESSION";
    private final SessionService sessions;
    private final ProblemResponses problems;
    public SessionAuthenticationFilter(SessionService sessions, ProblemResponses problems) { this.sessions=sessions; this.problems=problems; }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String secret=null;
        if (request.getCookies()!=null) for (Cookie cookie:request.getCookies()) {
            if (COOKIE_NAME.equals(cookie.getName())) { secret=cookie.getValue(); break; }
        }
        java.util.Optional<CurrentActor> resolved;
        try { resolved=sessions.resolve(secret); }
        catch (RuntimeException failure) {
            org.slf4j.LoggerFactory.getLogger(getClass()).error("Session resolution failed; exceptionType={} traceId={}",
                    failure.getClass().getName(), request.getAttribute("traceId"));
            boolean unavailable=failure instanceof org.springframework.dao.DataAccessException || failure instanceof jakarta.persistence.PersistenceException;
            problems.write(new ApplicationFailure(unavailable ? 503 : 500, unavailable ? "SESSION_STORE_UNAVAILABLE" : "INTERNAL_ERROR",
                    "Gangguan layanan", "Sesi tidak dapat diperiksa saat ini. Silakan mencoba kembali nanti."), request, response);
            return;
        }
        resolved.ifPresent(actor -> {
            var authorities=actor.permissions().stream().map(SimpleGrantedAuthority::new).toList();
            var authentication=UsernamePasswordAuthenticationToken.authenticated(actor, null, authorities);
            SecurityContextHolder.getContext().setAuthentication(authentication);
        });
        chain.doFilter(request, response);
    }
}
