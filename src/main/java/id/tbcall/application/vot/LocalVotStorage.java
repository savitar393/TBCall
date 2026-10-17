package id.tbcall.application.vot;

import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.channels.Channels;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.DirectoryIteratorException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.FileAttribute;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Instant;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class LocalVotStorage implements VotStorage, AutoCloseable {
    private static final LinkOption NO_LINKS = LinkOption.NOFOLLOW_LINKS;
    private static final String KEY = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
    private final Path root;
    private final long maxFileBytes;
    private DirectoryStream<Path> orphanEntries;
    private Iterator<Path> orphanIterator;

    public LocalVotStorage(VotProperties properties, Environment environment) {
        properties.validate(environment);
        maxFileBytes = properties.getMaxFileBytes();
        if (!properties.isEnabled()) { root = null; return; }
        try {
            Path configured = Path.of(properties.getStoragePath());
            if (!configured.isAbsolute()) throw new IOException("Absolute storage root required");
            configured = configured.normalize();
            validateLocation(configured);
            ensureDedicated(configured);
            createPrivateDirectories(configured);
            root = configured.toRealPath(NO_LINKS);
        } catch (IOException | RuntimeException failure) {
            // Startup exception chains are logged by Spring; filesystem causes can contain private paths.
            throw new IllegalStateException("VOT private storage configuration is unsafe or unavailable");
        }
    }

    @Override public StoredMedia store(InputStream input, String contentType, long declaredLength) throws IOException {
        checkRoot();
        String type = canonicalType(contentType);
        if (declaredLength > maxFileBytes) throw rejected(413, "Video exceeds the configured upload limit");
        if (declaredLength == 0 || declaredLength < -1) throw rejected(400, "Video length is invalid");
        if (input == null) throw rejected(400, "Video content is required");
        String key = UUID.randomUUID().toString();
        Path temporary = root.resolve(".upload-" + UUID.randomUUID() + ".tmp");
        long size = 0;
        try {
            try (var channel = Files.newByteChannel(temporary,
                    Set.of(StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE, NO_LINKS), filePermissions(root))) {
                var output = Channels.newOutputStream(channel);
                byte[] buffer = new byte[16_384];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (read == 0) { // Support streams that occasionally produce no bytes without spinning.
                        int one = input.read();
                        if (one < 0) break;
                        buffer[0] = (byte) one; read = 1;
                    }
                    size += read;
                    if (size > maxFileBytes) throw rejected(413, "Video exceeds the configured upload limit");
                    output.write(buffer, 0, read);
                }
            }
            if (size == 0 || (declaredLength >= 0 && declaredLength != size)) {
                throw rejected(400, "Video content is empty or incomplete");
            }
            validateMedia(temporary, type);
            checkRoot();
            try { Files.move(temporary, root.resolve(key), StandardCopyOption.ATOMIC_MOVE); }
            catch (AtomicMoveNotSupportedException unavailable) { throw new IOException("Private storage requires atomic file moves"); }
            return new StoredMedia(key, type, size);
        } finally { Files.deleteIfExists(temporary); }
    }

    @Override public InputStream open(String key) throws IOException {
        Path file = mediaPath(key);
        if (!Files.exists(file, NO_LINKS)) throw new java.nio.file.NoSuchFileException("Video is unavailable");
        if (!Files.isRegularFile(file, NO_LINKS) || Files.isSymbolicLink(file)) throw new IOException("Video is unavailable");
        SeekableByteChannel channel = Files.newByteChannel(file, Set.of(StandardOpenOption.READ, NO_LINKS));
        return Channels.newInputStream(channel);
    }

    @Override public void delete(String key) throws IOException {
        Path file = mediaPath(key);
        if (Files.isSymbolicLink(file) || (Files.exists(file, NO_LINKS) && !Files.isRegularFile(file, NO_LINKS))) {
            throw new IOException("Unsafe media entry");
        }
        Files.deleteIfExists(file);
    }

    /** Inspects at most 10,000 direct entries per call; subsequent calls resume the same sweep. */
    @Override public synchronized int cleanupOrphans(Set<String> retainedKeys, Instant olderThan, int limit) throws IOException {
        try {
            checkRoot();
            if (retainedKeys == null || olderThan == null || limit < 1 || limit > 1000) throw new IOException("Invalid cleanup request");
            if (orphanEntries == null) {
                orphanEntries = Files.newDirectoryStream(root);
                orphanIterator = orphanEntries.iterator();
            }
            int scanned = 0, removed = 0;
            while (scanned < 10_000 && removed < limit && orphanIterator.hasNext()) {
                Path file = orphanIterator.next(); scanned++;
                String name = file.getFileName().toString();
                if (!(name.matches(KEY) || partial(name)) || retainedKeys.contains(name)) continue;
                BasicFileAttributes attributes;
                try { attributes = Files.readAttributes(file, BasicFileAttributes.class, NO_LINKS); }
                catch (IOException unavailableEntry) { continue; }
                if (!attributes.isRegularFile() || !attributes.lastModifiedTime().toInstant().isBefore(olderThan)) continue;
                checkRoot();
                try { if (Files.deleteIfExists(file)) removed++; }
                catch (IOException retryLater) { /* Continue this sweep; retry the entry in a later full sweep. */ }
            }
            if (!orphanIterator.hasNext()) closeOrphanCursor();
            return removed;
        } catch (DirectoryIteratorException failure) {
            IOException cause = failure.getCause(); closeCursorAfterFailure(cause); throw cause;
        } catch (IOException | RuntimeException | Error failure) {
            closeCursorAfterFailure(failure); throw failure;
        }
    }

    /** The only persistent traversal resource is closed on sweep completion, failure, or bean shutdown. */
    @PreDestroy
    @Override public synchronized void close() throws IOException { closeOrphanCursor(); }

    private void closeOrphanCursor() throws IOException {
        DirectoryStream<Path> entries = orphanEntries;
        orphanEntries = null; orphanIterator = null;
        if (entries != null) entries.close();
    }
    private void closeCursorAfterFailure(Throwable failure) {
        try { closeOrphanCursor(); }
        catch (IOException closeFailure) { failure.addSuppressed(closeFailure); }
    }

    private Path mediaPath(String key) throws IOException {
        checkRoot();
        if (key == null || !key.matches(KEY)) throw new IOException("Invalid media identifier");
        return root.resolve(key);
    }
    private void checkRoot() throws IOException {
        if (root == null) throw new IOException("VOT storage is disabled");
        rejectLinks(root);
        if (!Files.isDirectory(root, NO_LINKS)) throw new IOException("Private storage is unavailable");
    }
    private static boolean partial(String name) { return name.matches("\\.upload-"+KEY+"\\.tmp"); }
    private static UploadRejected rejected(int status, String message) { return new UploadRejected(status, message); }
    private static String canonicalType(String contentType) throws UploadRejected {
        if (contentType == null) throw rejected(415, "Supported video content type required");
        String type = contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        if (!Set.of("video/webm", "video/mp4").contains(type)) throw rejected(415, "Only WebM and MP4 videos are supported");
        return type;
    }

    private static void validateLocation(Path candidate) throws IOException {
        if (candidate.getParent() == null) throw new IOException("Dedicated storage root required");
        rejectLinks(candidate);
        for (Path component : candidate) {
            if (Set.of("public", "static", "frontend", "wwwroot", ".git").contains(component.toString().toLowerCase(Locale.ROOT))) {
                throw new IOException("Public and repository locations are forbidden");
            }
        }
        Path project = Path.of("").toAbsolutePath().normalize();
        Set<Path> repositories = new HashSet<>(); repositories.add(project);
        for (Path ancestor = project; ancestor != null; ancestor = ancestor.getParent()) {
            Path marker = ancestor.resolve(".git");
            if (!Files.exists(marker, NO_LINKS)) continue;
            repositories.add(ancestor);
            Path git = Files.isDirectory(marker, NO_LINKS) ? marker : referencedPath(marker, "gitdir:");
            Path common = Files.exists(git.resolve("commondir")) ? referencedPath(git.resolve("commondir"), "") : git;
            if (common.getFileName().toString().equals(".git")) repositories.add(common.getParent());
            Path worktrees = common.resolve("worktrees");
            if (Files.isDirectory(worktrees, NO_LINKS)) {
                try (var registrations = Files.newDirectoryStream(worktrees)) {
                    for (Path registration : registrations) {
                        Path gitdir = registration.resolve("gitdir");
                        if (Files.isRegularFile(gitdir, NO_LINKS)) repositories.add(referencedPath(gitdir, "").getParent());
                    }
                }
            }
            break;
        }
        for (Path repository : repositories) {
            if (candidate.startsWith(repository) || repository.startsWith(candidate)) throw new IOException("Storage must be outside every repository worktree");
        }
        // Reject an unrelated Git checkout as well as the current repository's registered worktrees.
        for (Path ancestor = candidate; ancestor != null; ancestor = ancestor.getParent()) {
            if (Files.exists(ancestor.resolve(".git"), NO_LINKS)) throw new IOException("Storage must be outside repositories");
        }
    }
    private static Path referencedPath(Path metadata, String prefix) throws IOException {
        String value = Files.readString(metadata).trim();
        if (!value.startsWith(prefix) || value.length() > 4096) throw new IOException("Invalid repository metadata");
        Path path = Path.of(value.substring(prefix.length()).trim());
        return (path.isAbsolute() ? path : metadata.getParent().resolve(path)).toAbsolutePath().normalize();
    }
    private static void rejectLinks(Path path) throws IOException {
        for (Path part = path; part != null; part = part.getParent()) {
            if (Files.isSymbolicLink(part) || (Files.exists(part, NO_LINKS) && !Files.isDirectory(part, NO_LINKS))) {
                throw new IOException("Storage directory must not traverse links or files");
            }
            // Windows junctions/reparse directories can otherwise escape without isSymbolicLink being true.
            if (Files.exists(part, NO_LINKS) && !part.toRealPath().equals(part.toAbsolutePath().normalize())) {
                throw new IOException("Storage directory resolves through an alias");
            }
        }
    }
    private static void ensureDedicated(Path directory) throws IOException {
        if (!Files.exists(directory, NO_LINKS)) return;
        try (var entries = Files.newDirectoryStream(directory)) {
            int inspected = 0;
            for (Path entry : entries) {
                if (++inspected > 100_000) throw new IOException("Storage directory exceeds the startup inspection bound");
                String name = entry.getFileName().toString();
                if ((!name.matches(KEY) && !partial(name)) || !Files.isRegularFile(entry, NO_LINKS)) throw new IOException("Dedicated private storage directory required");
            }
        }
    }
    private static void createPrivateDirectories(Path directory) throws IOException {
        if (!Files.exists(directory, NO_LINKS)) {
            Path parent = directory.getParent();
            if (!Files.exists(parent, NO_LINKS)) createPrivateDirectories(parent);
            rejectLinks(parent);
            Files.createDirectory(directory, directoryPermissions(parent));
        }
        rejectLinks(directory);
        if (Files.getFileStore(directory).supportsFileAttributeView("posix")) {
            Files.setPosixFilePermissions(directory, PosixFilePermissions.fromString("rwx------"));
            try (var entries = Files.newDirectoryStream(directory)) {
                for (Path entry : entries) {
                    if (Files.isRegularFile(entry, NO_LINKS)) Files.setPosixFilePermissions(entry, PosixFilePermissions.fromString("rw-------"));
                }
            }
        }
        // On Windows the operator must provision this dedicated directory with owner-only OS ACLs.
    }
    private static FileAttribute<?>[] directoryPermissions(Path parent) throws IOException {
        return Files.getFileStore(parent).supportsFileAttributeView("posix")
                ? new FileAttribute<?>[]{PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------"))} : new FileAttribute<?>[0];
    }
    private static FileAttribute<?>[] filePermissions(Path parent) throws IOException {
        return Files.getFileStore(parent).supportsFileAttributeView("posix")
                ? new FileAttribute<?>[]{PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------"))} : new FileAttribute<?>[0];
    }

    private static void validateMedia(Path file, String contentType) throws IOException {
        try (var input = new RandomAccessFile(file.toFile(), "r")) {
            boolean webm = input.length() >= 4 && input.readInt() == 0x1a45dfa3;
            input.seek(0);
            if (webm != contentType.equals("video/webm")) throw rejected(415, "Video format does not match its content type");
            var parser = new MediaParser(input);
            if (webm) parser.webm(); else parser.mp4();
        } catch (UploadRejected rejected) { throw rejected; }
        catch (java.io.EOFException malformed) { throw rejected(400, "Video container is incomplete"); }
    }

    /** Structural admission only: no codec decoding, duration guarantee, or clinical inference. */
    private static final class MediaParser {
        private final RandomAccessFile input;
        private int elements;
        MediaParser(RandomAccessFile input) { this.input = input; }
        private void require(boolean condition) throws UploadRejected {
            if (!condition) throw rejected(400, "Video container is invalid or incomplete");
        }
        private void budget() throws UploadRejected { require(++elements <= 100_000); }
        private record Element(long id, long start, long end, boolean unknown) {}
        private long vint(boolean identifier) throws IOException {
            int first = input.readUnsignedByte(), width = 1, mask = 0x80;
            while (width <= 8 && (first & mask) == 0) { mask >>>= 1; width++; }
            require(width <= (identifier ? 4 : 8));
            long value = identifier ? first : first & (mask - 1);
            boolean unknown = !identifier && value == mask - 1;
            for (int i = 1; i < width; i++) { int next = input.readUnsignedByte(); value = (value << 8) | next; unknown &= next == 255; }
            return unknown ? -1 : value;
        }
        private Element ebml(long boundary, boolean allowUnknown) throws IOException {
            budget();
            long id = vint(true), size = vint(false), start = input.getFilePointer();
            require(start <= boundary && (size < 0 ? allowUnknown : size <= boundary - start));
            return new Element(id, start, size < 0 ? boundary : start + size, size < 0);
        }
        private String text(Element element) throws IOException {
            require(element.end - element.start <= 64);
            byte[] bytes = new byte[(int)(element.end - element.start)]; input.readFully(bytes);
            return new String(bytes, StandardCharsets.US_ASCII);
        }
        private long number(Element element) throws IOException {
            require(element.end > element.start && element.end - element.start <= 8);
            long result = 0; while (input.getFilePointer() < element.end) result = (result << 8) | input.readUnsignedByte();
            return result;
        }
        void webm() throws IOException {
            long end = input.length();
            Element header = ebml(end, false); require(header.id == 0x1a45dfa3);
            boolean docType = false;
            while (input.getFilePointer() < header.end) {
                Element field = ebml(header.end, false);
                if (field.id == 0x4282) docType = text(field).equals("webm");
                input.seek(field.end);
            }
            require(docType);
            Element segment = ebml(end, true); require(segment.id == 0x18538067 && segment.end == end);
            Set<Long> videoTracks = new HashSet<>(); boolean media = false;
            while (input.getFilePointer() < end) {
                Element field = ebml(end, true);
                require(!field.unknown || field.id == 0x1f43b675);
                if (field.id == 0x1654ae6b) tracks(field, videoTracks);
                else if (field.id == 0x1f43b675) media |= cluster(field, videoTracks);
                if (!field.unknown) input.seek(field.end);
            }
            require(!videoTracks.isEmpty() && media);
        }
        private void tracks(Element tracks, Set<Long> videoTracks) throws IOException {
            while (input.getFilePointer() < tracks.end) {
                Element track = ebml(tracks.end, false);
                if (track.id == 0xae) {
                    long number = 0, type = 0; String codec = ""; boolean dimensions = false;
                    while (input.getFilePointer() < track.end) {
                        Element field = ebml(track.end, false);
                        if (field.id == 0xd7) number = number(field);
                        else if (field.id == 0x83) type = number(field);
                        else if (field.id == 0x86) codec = text(field);
                        else if (field.id == 0xe0) dimensions = dimensions(field);
                        input.seek(field.end);
                    }
                    if (type == 1 && number > 0 && dimensions && Set.of("V_VP8", "V_VP9", "V_AV1").contains(codec)) videoTracks.add(number);
                }
                input.seek(track.end);
            }
        }
        private boolean dimensions(Element video) throws IOException {
            long width = 0, height = 0;
            while (input.getFilePointer() < video.end) {
                Element field = ebml(video.end, false);
                if (field.id == 0xb0) width = number(field);
                else if (field.id == 0xba) height = number(field);
                input.seek(field.end);
            }
            return width > 0 && height > 0;
        }
        private boolean cluster(Element cluster, Set<Long> tracks) throws IOException {
            boolean timecode = false, block = false;
            while (input.getFilePointer() < cluster.end) {
                long before = input.getFilePointer();
                Element field = ebml(cluster.end, true);
                // Unknown-sized clusters end at the next segment-level element.
                if (cluster.unknown && Set.of(0x1f43b675L, 0x1c53bb6bL, 0x1254c367L, 0x114d9b74L).contains(field.id)) {
                    input.seek(before); break;
                }
                require(!field.unknown);
                if (field.id == 0xe7) { number(field); timecode = true; }
                else if (field.id == 0xa3) block |= block(field, tracks);
                else if (field.id == 0xa0) {
                    while (input.getFilePointer() < field.end) {
                        Element child = ebml(field.end, false);
                        if (child.id == 0xa1) block |= block(child, tracks);
                        input.seek(child.end);
                    }
                }
                input.seek(field.end);
            }
            return timecode && block;
        }
        private boolean block(Element block, Set<Long> tracks) throws IOException {
            long track = vint(false);
            require(block.end - input.getFilePointer() >= 4); // Timecode, flags, at least one encoded frame byte.
            input.readShort(); int flags = input.readUnsignedByte();
            require((flags & 0x06) == 0); // Browser video blocks do not need lacing; reject unvalidated laced layouts.
            return tracks.contains(track);
        }
        private Element box(long end) throws IOException {
            budget(); long start = input.getFilePointer(); require(end - start >= 8);
            long size = Integer.toUnsignedLong(input.readInt()); long type = Integer.toUnsignedLong(input.readInt());
            if (size == 1) { require(end - start >= 16); size = input.readLong(); require(size >= 16); }
            else if (size == 0) size = end - start;
            require(size >= input.getFilePointer() - start && size <= end - start);
            return new Element(type, input.getFilePointer(), start + size, false);
        }
        void mp4() throws IOException {
            boolean brand = false, video = false, data = false;
            long end = input.length();
            while (input.getFilePointer() < end) {
                Element box = box(end);
                if (box.id == fourcc("ftyp")) {
                    require(box.end - box.start >= 8 && (box.end - box.start) % 4 == 0);
                    String major = readFourcc(); input.readInt();
                    brand = supportedBrand(major);
                    while (input.getFilePointer() < box.end) brand |= supportedBrand(readFourcc());
                } else if (box.id == fourcc("moov")) video |= movie(box);
                else if (box.id == fourcc("mdat")) data |= box.end > box.start;
                input.seek(box.end);
            }
            require(brand && video && data);
        }
        private boolean movie(Element movie) throws IOException {
            boolean video = false;
            while (input.getFilePointer() < movie.end) {
                Element track = box(movie.end);
                if (track.id == fourcc("trak")) video |= track(track);
                input.seek(track.end);
            }
            return video;
        }
        private boolean track(Element track) throws IOException {
            boolean video = false;
            while (input.getFilePointer() < track.end) {
                Element media = box(track.end);
                if (media.id == fourcc("mdia")) {
                    boolean handler = false, sample = false;
                    while (input.getFilePointer() < media.end) {
                        Element field = box(media.end);
                        if (field.id == fourcc("hdlr")) {
                            require(field.end - field.start >= 24); input.skipBytes(8); handler = readFourcc().equals("vide");
                        } else if (field.id == fourcc("minf")) sample = sampleTables(field);
                        input.seek(field.end);
                    }
                    video |= handler && sample;
                }
                input.seek(media.end);
            }
            return video;
        }
        private boolean sampleTables(Element info) throws IOException {
            boolean video = false;
            while (input.getFilePointer() < info.end) {
                Element table = box(info.end);
                if (table.id == fourcc("stbl")) {
                    while (input.getFilePointer() < table.end) {
                        Element description = box(table.end);
                        if (description.id == fourcc("stsd")) {
                            require(description.end - description.start >= 8); input.readInt();
                            long count = Integer.toUnsignedLong(input.readInt()); require(count > 0 && count <= 100);
                            for (int i = 0; i < count; i++) {
                                Element sample = box(description.end);
                                if (Set.of(fourcc("avc1"), fourcc("avc3"), fourcc("hvc1"), fourcc("hev1"), fourcc("vp09"), fourcc("av01"), fourcc("mp4v")).contains(sample.id)) {
                                    video |= visualSample(sample);
                                }
                                input.seek(sample.end);
                            }
                            require(input.getFilePointer() == description.end);
                        }
                        input.seek(description.end);
                    }
                }
                input.seek(table.end);
            }
            return video;
        }
        private boolean visualSample(Element sample) throws IOException {
            require(sample.end - sample.start >= 78);
            input.seek(sample.start + 6); require(input.readUnsignedShort() > 0);
            input.seek(sample.start + 24); require(input.readUnsignedShort() > 0 && input.readUnsignedShort() > 0);
            input.seek(sample.start + 78);
            boolean configuration = false;
            while (input.getFilePointer() < sample.end) {
                Element config = box(sample.end);
                if (Set.of(fourcc("avc1"), fourcc("avc3")).contains(sample.id) && config.id == fourcc("avcC")) {
                    require(config.end - config.start >= 7 && input.readUnsignedByte() == 1);
                    input.skipBytes(3); require((input.readUnsignedByte() & 3) != 2);
                    int sps = input.readUnsignedByte() & 31; require(sps > 0);
                    for (int i = 0; i < sps; i++) parameterSet(config.end);
                    require(input.getFilePointer() < config.end); int pps = input.readUnsignedByte(); require(pps > 0);
                    for (int i = 0; i < pps; i++) parameterSet(config.end);
                    configuration = true;
                } else if (Set.of(fourcc("hvc1"), fourcc("hev1")).contains(sample.id) && config.id == fourcc("hvcC")) {
                    require(config.end - config.start >= 23 && input.readUnsignedByte() == 1); configuration = true;
                } else if (sample.id == fourcc("av01") && config.id == fourcc("av1C")) {
                    require(config.end - config.start >= 4 && input.readUnsignedByte() == 0x81); configuration = true;
                } else if (sample.id == fourcc("vp09") && config.id == fourcc("vpcC")) {
                    require(config.end - config.start >= 12); configuration = true;
                } else if (sample.id == fourcc("mp4v") && config.id == fourcc("esds")) {
                    require(config.end - config.start > 4); configuration = true;
                }
                input.seek(config.end);
            }
            return configuration;
        }
        private void parameterSet(long end) throws IOException {
            require(end - input.getFilePointer() >= 2);
            int size = input.readUnsignedShort(); require(size > 0 && size <= end - input.getFilePointer());
            input.skipBytes(size);
        }
        private String readFourcc() throws IOException { byte[] value = new byte[4]; input.readFully(value); return new String(value, StandardCharsets.US_ASCII); }
        private static boolean supportedBrand(String brand) { return Set.of("isom", "iso2", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "dash").contains(brand); }
        private static long fourcc(String type) { long value = 0; for (byte b : type.getBytes(StandardCharsets.US_ASCII)) value = (value << 8) | (b & 255); return value; }
    }
}
