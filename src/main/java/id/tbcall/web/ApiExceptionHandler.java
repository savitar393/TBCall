package id.tbcall.web;

import id.tbcall.application.common.ApplicationFailure;
import jakarta.persistence.OptimisticLockException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.HttpMediaTypeNotSupportedException;

@RestControllerAdvice
public class ApiExceptionHandler {
    private final ProblemResponses problems;
    public ApiExceptionHandler(ProblemResponses problems) { this.problems=problems; }
    @ExceptionHandler(ApplicationFailure.class)
    ResponseEntity<?> failure(ApplicationFailure failure, HttpServletRequest request) { return problems.response(failure, request); }
    @ExceptionHandler({OptimisticLockException.class, OptimisticLockingFailureException.class})
    ResponseEntity<?> optimistic(Exception error, HttpServletRequest request) { return problems.response(ApplicationFailure.optimistic(), request); }
    @ExceptionHandler({DataIntegrityViolationException.class, org.hibernate.exception.ConstraintViolationException.class})
    ResponseEntity<?> integrity(Exception error, HttpServletRequest request) {
        return problems.response(new ApplicationFailure(409, "DATA_CONFLICT", "Konflik data", "Identitas atau tautan akun sudah digunakan. Muat ulang data sebelum mencoba kembali."), request);
    }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<?> validation(MethodArgumentNotValidException error, HttpServletRequest request) {
        String detail=error.getBindingResult().getFieldErrors().stream().map(e -> e.getField()+": "+e.getDefaultMessage())
                .distinct().collect(java.util.stream.Collectors.joining(" "));
        return problems.response(ApplicationFailure.invalid(detail), request);
    }
    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class, ConstraintViolationException.class,
            org.springframework.web.bind.MissingServletRequestParameterException.class})
    ResponseEntity<?> malformed(Exception error, HttpServletRequest request) {
        return problems.response(ApplicationFailure.invalid("Format data permintaan tidak valid."), request);
    }
    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<?> missing(Exception error, HttpServletRequest request) { return problems.response(ApplicationFailure.missing(), request); }
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<?> method(Exception error, HttpServletRequest request) {
        return problems.response(new ApplicationFailure(405, "METHOD_NOT_ALLOWED", "Metode tidak diizinkan", "Metode permintaan tidak tersedia untuk alamat ini."), request);
    }
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<?> media(Exception error, HttpServletRequest request) {
        return problems.response(new ApplicationFailure(415, "UNSUPPORTED_MEDIA_TYPE", "Format tidak didukung", "Gunakan Content-Type application/json."), request);
    }
    @ExceptionHandler(Exception.class)
    ResponseEntity<?> unexpected(Exception error, HttpServletRequest request) {
        org.slf4j.LoggerFactory.getLogger(getClass()).error("Request failed; exceptionType={} traceId={}", error.getClass().getName(), request.getAttribute("traceId"));
        return problems.response(new ApplicationFailure(500, "INTERNAL_ERROR", "Gangguan layanan", "Permintaan tidak dapat diproses. Gunakan ID permintaan saat menghubungi petugas."), request);
    }
}
