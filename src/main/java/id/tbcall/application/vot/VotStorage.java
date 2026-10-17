package id.tbcall.application.vot;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.Set;

public interface VotStorage {
    record StoredMedia(String key, String contentType, long size) {}
    StoredMedia store(InputStream input, String contentType, long declaredLength) throws IOException;
    InputStream open(String key) throws IOException;
    void delete(String key) throws IOException;
    int cleanupOrphans(Set<String> retainedKeys, Instant olderThan, int limit) throws IOException;

    /** Safe public rejection detail; infrastructure IOException details must not reach clients. */
    final class UploadRejected extends IOException {
        private final int status;
        public UploadRejected(int status, String message) { super(message); this.status = status; }
        public int getStatus() { return status; }
    }
}
