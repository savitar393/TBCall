package id.tbcall.web;

import id.tbcall.application.common.ApplicationFailure;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class ProblemResponses {
    private final ObjectMapper json;
    public ProblemResponses(ObjectMapper json) { this.json=json; }
    public record Problem(String type, String title, int status, String detail, String code, String traceId) {}
    private Problem body(ApplicationFailure failure, HttpServletRequest request) {
        Object trace=request.getAttribute("traceId");
        return new Problem("about:blank", failure.title(), failure.status(), failure.getMessage(), failure.code(),
                trace==null ? UUID.randomUUID().toString() : trace.toString());
    }
    public ResponseEntity<Problem> response(ApplicationFailure failure, HttpServletRequest request) {
        return ResponseEntity.status(failure.status()).header("Content-Type", "application/problem+json").body(body(failure, request));
    }
    public void write(ApplicationFailure failure, HttpServletRequest request, HttpServletResponse response) throws IOException {
        response.setStatus(failure.status()); response.setContentType("application/problem+json"); response.setCharacterEncoding("UTF-8");
        response.getWriter().write(json.writeValueAsString(body(failure, request)));
    }
    public void writeCorsRejection(org.springframework.http.server.ServerHttpResponse response) throws IOException {
        response.setStatusCode(org.springframework.http.HttpStatus.FORBIDDEN);
        response.getHeaders().setContentType(org.springframework.http.MediaType.parseMediaType("application/problem+json"));
        String trace=org.slf4j.MDC.get("traceId");
        Problem body=new Problem("about:blank", "Akses lintas origin ditolak", 403,
                "Origin, metode, atau header permintaan tidak diizinkan.", "CORS_DENIED", trace==null ? UUID.randomUUID().toString() : trace);
        response.getBody().write(json.writeValueAsBytes(body));
        response.flush();
    }
}
