package id.tbcall.application.vot;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

public class LocalVotStorageTest {
    @TempDir Path temporary;

    @Test void storesOpaquePrivateMediaAndCanReadAndDeleteIt() throws Exception {
        var storage = storage(20_971_520);
        byte[] media = webm(false);
        var stored = storage.store(new ByteArrayInputStream(media), "video/webm", media.length);
        assertThat(stored.contentType()).isEqualTo("video/webm");
        assertThat(stored.size()).isEqualTo(media.length);
        assertThat(UUID.fromString(stored.key()).toString()).isEqualTo(stored.key());
        if (Files.getFileStore(root()).supportsFileAttributeView("posix")) {
            assertThat(Files.getPosixFilePermissions(root())).isEqualTo(java.nio.file.attribute.PosixFilePermissions.fromString("rwx------"));
            assertThat(Files.getPosixFilePermissions(root().resolve(stored.key()))).isEqualTo(java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
        }
        try (var input = storage.open(stored.key())) { assertThat(input.readAllBytes()).isEqualTo(media); }
        storage.delete(stored.key()); storage.delete(stored.key());
        assertThatThrownBy(() -> storage.open(stored.key())).isInstanceOf(java.nio.file.NoSuchFileException.class);
    }

    @Test void acceptsLiveUnknownSizeWebmAndStructuredMp4() throws Exception {
        var storage = storage(20_971_520);
        for (byte[] media : new byte[][]{webm(true), mp4()}) {
            String type = media[0] == 0x1a ? "video/webm" : "video/mp4";
            assertThat(storage.store(new ByteArrayInputStream(media), type, -1).size()).isEqualTo(media.length);
        }
    }

    @Test void disabledStorageRejectsAllOperationsWithoutCreatingDirectories() throws Exception {
        var p = new VotProperties(); p.setStoragePath(root().toString());
        var storage = new LocalVotStorage(p, VotPropertiesTest.development());
        assertThatIOException().isThrownBy(() -> storage.store(new ByteArrayInputStream(webm(false)), "video/webm", -1));
        assertThatIOException().isThrownBy(() -> storage.open(UUID.randomUUID().toString()));
        assertThatIOException().isThrownBy(() -> storage.delete(UUID.randomUUID().toString()));
        assertThatIOException().isThrownBy(() -> storage.cleanupOrphans(Set.of(), Instant.now(), 10));
        assertThat(Files.exists(root())).isFalse();
    }

    @Test void rejectionsGiveSafeStatusAndNeverLeakPaths() throws Exception {
        var storage = storage(100);
        assertThatThrownBy(() -> storage.store(new ByteArrayInputStream(new byte[101]), "video/mp4", -1))
                .isInstanceOfSatisfying(VotStorage.UploadRejected.class, rejected -> assertThat(rejected.getStatus()).isEqualTo(413))
                .hasMessageNotContaining(temporary.toString());
        assertThatThrownBy(() -> storage.store(new ByteArrayInputStream(new byte[1]), "image/png", -1))
                .isInstanceOfSatisfying(VotStorage.UploadRejected.class, rejected -> assertThat(rejected.getStatus()).isEqualTo(415));
        assertThatThrownBy(() -> storage.store(new ByteArrayInputStream(new byte[1]), "video/mp4", -1))
                .isInstanceOfSatisfying(VotStorage.UploadRejected.class, rejected -> assertThat(rejected.getStatus()).isEqualTo(400));
    }

    @Test void rejectsEmptyRandomTruncatedHeaderOnlyAndMismatchedMimeWithoutLeavingFiles() throws Exception {
        var storage = storage(20_971_520);
        byte[] valid = webm(false);
        for (byte[] invalid : new byte[][]{new byte[0], "not a video".getBytes(StandardCharsets.UTF_8),
                Arrays.copyOf(valid, valid.length - 1), hex("1a45dfa3801853806780"),
                box("ftyp", "isom0000isom".getBytes(StandardCharsets.US_ASCII)),
                box("mdat", new byte[]{1, 2, 3}), Arrays.copyOf(mp4(), mp4().length - 1)}) {
            assertThatIOException().isThrownBy(() -> storage.store(new ByteArrayInputStream(invalid), "video/webm", -1));
            assertThatIOException().isThrownBy(() -> storage.store(new ByteArrayInputStream(invalid), "video/mp4", -1));
        }
        assertThatIOException().isThrownBy(() -> storage.store(new ByteArrayInputStream(valid), "video/mp4", -1));
        assertThatIOException().isThrownBy(() -> storage.store(new ByteArrayInputStream(valid), "text/plain", -1));
        try (var files = Files.list(root())) { assertThat(files).isEmpty(); }
    }

    @Test void enforcesActualStreamSizeEvenWhenDeclaredLengthLies() throws Exception {
        byte[] valid = webm(false);
        var storage = storage(valid.length - 1);
        assertThatIOException().isThrownBy(() -> storage.store(new ByteArrayInputStream(valid), "video/webm", 1));
        assertThatIOException().isThrownBy(() -> storage.store(new ByteArrayInputStream(valid), "video/webm", valid.length));
        try (var files = Files.list(root())) { assertThat(files).isEmpty(); }
    }

    @Test void rejectsDeclaredLengthMismatchAndCleansInterruptedUploads() throws Exception {
        var storage = storage(20_971_520);
        byte[] media = webm(false);
        assertThatIOException().isThrownBy(() -> storage.store(new ByteArrayInputStream(media), "video/webm", media.length + 1));
        InputStream interrupted = new InputStream() {
            int count;
            @Override public int read() throws IOException {
                if (count++ > 8) throw new IOException("synthetic interrupted stream");
                return 1;
            }
        };
        assertThatIOException().isThrownBy(() -> storage.store(interrupted, "video/webm", -1));
        try (var files = Files.list(root())) { assertThat(files).isEmpty(); }
    }

    @Test void refusesTraversalKeysForOpenAndDelete() throws Exception {
        var storage = storage(20_971_520);
        for (String key : new String[]{"../secret", "..\\secret", "/secret", "ABC", UUID.randomUUID()+".mp4"}) {
            assertThatIOException().isThrownBy(() -> storage.open(key));
            assertThatIOException().isThrownBy(() -> storage.delete(key));
        }
    }

    @Test void cleanupKeepsReferencedAndRecentMediaAndBoundsDeletedCount() throws Exception {
        var storage = storage(20_971_520);
        byte[] media = webm(false);
        String retained = storage.store(new ByteArrayInputStream(media), "video/webm", -1).key();
        String old = storage.store(new ByteArrayInputStream(media), "video/webm", -1).key();
        String recent = storage.store(new ByteArrayInputStream(media), "video/webm", -1).key();
        Instant cutoff = Instant.now().minusSeconds(60);
        Files.setLastModifiedTime(root().resolve(retained), FileTime.from(cutoff.minusSeconds(60)));
        Files.setLastModifiedTime(root().resolve(old), FileTime.from(cutoff.minusSeconds(60)));
        Path partial = root().resolve(".upload-"+UUID.randomUUID()+".tmp");
        Files.write(partial, new byte[]{1});
        Files.setLastModifiedTime(partial, FileTime.from(cutoff.minusSeconds(60)));
        assertThat(storage.cleanupOrphans(Set.of(retained), cutoff, 1)).isLessThanOrEqualTo(1);
        storage.cleanupOrphans(Set.of(retained), cutoff, 100);
        assertThat(Files.exists(root().resolve(retained))).isTrue();
        assertThat(Files.exists(root().resolve(recent))).isTrue();
        assertThat(Files.exists(root().resolve(old))).isFalse();
        assertThat(Files.exists(partial)).isFalse();
    }

    @Test void cleanupResumesAfterScanBoundToReachOldOrphansBehindRetainedMedia() throws Exception {
        try (var storage = storage(20_971_520)) {
            for (int i = 0; i < 10_001; i++) Files.write(root().resolve(UUID.randomUUID().toString()), new byte[]{1});
            // Use the filesystem's observed order so the orphan is beyond one bounded sweep on every OS.
            Path last = null;
            try (var entries = Files.newDirectoryStream(root())) { for (Path entry : entries) last = entry; }
            assertThat(last).isNotNull();
            Path orphan = last;
            String orphanKey = orphan.getFileName().toString();
            Instant cutoff = Instant.now().minusSeconds(60);
            Files.setLastModifiedTime(orphan, FileTime.from(cutoff.minusSeconds(60)));
            Set<String> retained = new java.util.AbstractSet<>() {
                @Override public boolean contains(Object key) { return !orphanKey.equals(key); }
                @Override public java.util.Iterator<String> iterator() { throw new AssertionError("Do not materialize retained media keys"); }
                @Override public int size() { throw new AssertionError("Do not materialize retained media keys"); }
            };
            assertThat(storage.cleanupOrphans(retained, cutoff, 1)).isZero();
            assertThat(Files.exists(orphan)).isTrue();
            assertThat(storage.cleanupOrphans(retained, cutoff, 1)).isEqualTo(1);
            assertThat(Files.exists(orphan)).isFalse();
        }
    }

    @Test void cleanupCompletesSweepAndStartsAnotherForNewOrphans() throws Exception {
        try (var storage = storage(20_971_520)) {
            Instant cutoff = Instant.now().minusSeconds(60);
            for (int i = 0; i < 3; i++) {
                Path file = root().resolve(UUID.randomUUID().toString()); Files.write(file, new byte[]{1});
                Files.setLastModifiedTime(file, FileTime.from(cutoff.minusSeconds(60)));
            }
            for (int i = 0; i < 3; i++) assertThat(storage.cleanupOrphans(Set.of(), cutoff, 1)).isEqualTo(1);
            Path later = root().resolve(UUID.randomUUID().toString()); Files.write(later, new byte[]{1});
            Files.setLastModifiedTime(later, FileTime.from(cutoff.minusSeconds(60)));
            assertThat(storage.cleanupOrphans(Set.of(), cutoff, 1)).isEqualTo(1);
            assertThat(Files.exists(later)).isFalse();
        }
    }

    @Test void undeletableOrphanDoesNotBlockOtherOldMedia() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(System.getProperty("os.name").startsWith("Windows"), "Windows read-only deletion semantics");
        try (var storage = storage(20_971_520)) {
            Instant cutoff = Instant.now().minusSeconds(60);
            for (int i = 0; i < 2; i++) {
                Path file = root().resolve(UUID.randomUUID().toString()); Files.write(file, new byte[]{1});
                Files.setLastModifiedTime(file, FileTime.from(cutoff.minusSeconds(60)));
            }
            Path blocked;
            try (var entries = Files.newDirectoryStream(root())) { blocked = entries.iterator().next(); }
            Files.setAttribute(blocked, "dos:readonly", true);
            try {
                assertThat(storage.cleanupOrphans(Set.of(), cutoff, 1)).isEqualTo(1);
                assertThat(Files.exists(blocked)).isTrue();
            } finally { Files.setAttribute(blocked, "dos:readonly", false); }
            storage.cleanupOrphans(Set.of(), cutoff, 100);
            storage.cleanupOrphans(Set.of(), cutoff, 100);
            assertThat(Files.exists(blocked)).isFalse();
        }
    }

    @Test void shutdownClosesPartialSweepAndAllowsStorageRestart() throws Exception {
        var storage = storage(20_971_520);
        Instant cutoff = Instant.now().minusSeconds(60);
        for (int i = 0; i < 3; i++) {
            Path file = root().resolve(UUID.randomUUID().toString()); Files.write(file, new byte[]{1});
            Files.setLastModifiedTime(file, FileTime.from(cutoff.minusSeconds(60)));
        }
        try { assertThat(storage.cleanupOrphans(Set.of(), cutoff, 1)).isEqualTo(1); }
        finally { storage.close(); storage.close(); }
        try (var restarted = storage(20_971_520)) {
            assertThat(restarted.cleanupOrphans(Set.of(), cutoff, 100)).isEqualTo(2);
        }
        Files.delete(root()); // In particular, Windows must no longer have an open directory cursor.
    }

    @Test void neverFollowsSymlinkFilesOrRoots() throws Exception {
        var storage = storage(20_971_520);
        Path outside = temporary.resolve("outside"); Files.writeString(outside, "private");
        String key = UUID.randomUUID().toString();
        try { Files.createSymbolicLink(root().resolve(key), outside); }
        catch (IOException | UnsupportedOperationException | SecurityException unavailable) { assumeTrue(false, "OS does not permit symlinks"); }
        assertThatIOException().isThrownBy(() -> storage.open(key));
        assertThatIOException().isThrownBy(() -> storage.delete(key));
        assertThat(storage.cleanupOrphans(Set.of(), Instant.now().plusSeconds(60), 100)).isZero();
        assertThat(Files.readString(outside)).isEqualTo("private");
    }

    private Path root() { return temporary.resolve("media"); }
    private LocalVotStorage storage(long limit) {
        var p = new VotProperties(); p.setEnabled(true); p.setStoragePath(root().toString()); p.setMaxFileBytes(limit);
        return new LocalVotStorage(p, VotPropertiesTest.development());
    }

    // Small synthetic container fixtures, with one video track and a nonempty block/sample.
    public static byte[] webm(boolean live) {
        byte[] header = element("1a45dfa3", element("4282", "webm".getBytes(StandardCharsets.US_ASCII)));
        byte[] track = element("ae", join(element("d7", new byte[]{1}), element("83", new byte[]{1}),
                element("86", "V_VP8".getBytes(StandardCharsets.US_ASCII)),
                element("e0", join(element("b0", new byte[]{16}), element("ba", new byte[]{16})))));
        byte[] data = join(element("1654ae6b", track), element("1f43b675", join(
                element("e7", new byte[]{0}), element("a3", hex("810000801000009d012a1000100000")))));
        return join(header, live ? join(hex("1853806701ffffffffffffff"), data) : element("18538067", data));
    }
    public static byte[] mp4() {
        byte[] handler = join(new byte[8], "vide".getBytes(StandardCharsets.US_ASCII), new byte[12]);
        byte[] visualHeader = new byte[78];
        visualHeader[7] = 1; visualHeader[25] = 16; visualHeader[27] = 16;
        byte[] entry = box("avc1", join(visualHeader, box("avcC", hex("0142001effe100096742001ee901407b2001000468ce3c80"))));
        byte[] sampleDescription = box("stsd", join(new byte[4], new byte[]{0,0,0,1}, entry));
        return join(box("ftyp", join("isom".getBytes(StandardCharsets.US_ASCII), new byte[4], "isommp42".getBytes(StandardCharsets.US_ASCII))),
                box("moov", box("trak", box("mdia", join(box("hdlr", handler),
                        box("minf", box("stbl", sampleDescription)))))), box("mdat", new byte[]{0,0,0,2,0x65,1}));
    }
    private static byte[] element(String id, byte[] value) {
        if (value.length >= 127) throw new IllegalArgumentException("fixture too long");
        return join(hex(id), new byte[]{(byte)(0x80 | value.length)}, value);
    }
    private static byte[] box(String type, byte[] value) {
        return join(ByteBuffer.allocate(4).putInt(value.length+8).array(), type.getBytes(StandardCharsets.US_ASCII), value);
    }
    private static byte[] join(byte[]... values) {
        var out = new ByteArrayOutputStream(); for (byte[] value : values) out.writeBytes(value); return out.toByteArray();
    }
    private static byte[] hex(String value) { return HexFormat.of().parseHex(value); }
}
