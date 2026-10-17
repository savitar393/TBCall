package id.tbcall.application.vot;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;

class VotPropertiesTest {
    @TempDir Path temporary;

    @Test void disabledConfigurationNeverCreatesStorageEvenWithInvalidSettings() throws Exception {
        var p = new VotProperties();
        Path absent = temporary.resolve("absent");
        p.setStoragePath(absent.toString());
        p.setMaxFileBytes(-1);
        new LocalVotStorage(p, new MockEnvironment().withProperty("security.production", "true"));
        assertThat(Files.exists(absent)).isFalse();
    }

    @Test void productionAndMissingExplicitSyntheticProfileFailClosed() {
        for (String profile : new String[]{"prod", "production", "default"}) {
            var env = new MockEnvironment();
            env.setActiveProfiles(profile);
            assertThatIllegalStateException().isThrownBy(() -> new LocalVotStorage(enabled(), env));
        }
        var production = development().withProperty("security.production", "true");
        assertThatIllegalStateException().isThrownBy(() -> new LocalVotStorage(enabled(), production));
        var actualProduction = development().withProperty("tbcall.security.production", "true");
        assertThatIllegalStateException().isThrownBy(() -> new LocalVotStorage(enabled(), actualProduction));
        var mixed = development(); mixed.setActiveProfiles("dev", "prod");
        assertThatIllegalStateException().isThrownBy(() -> new LocalVotStorage(enabled(), mixed));
    }

    @Test void invalidLimitsAndNonSyntheticModeFailBeforeCreatingDirectories() {
        for (long size : new long[]{-1, 0, 20_971_521}) {
            var p = enabled(); p.setMaxFileBytes(size);
            assertThatIllegalStateException().isThrownBy(() -> new LocalVotStorage(p, development()));
        }
        for (int days : new int[]{-1, 0, 366}) {
            var p = enabled(); p.setRetentionDays(days);
            assertThatIllegalStateException().isThrownBy(() -> new LocalVotStorage(p, development()));
        }
        var p = enabled(); p.setSyntheticOnly(false);
        assertThatIllegalStateException().isThrownBy(() -> new LocalVotStorage(p, development()));
        assertThat(Files.exists(temporary.resolve("media"))).isFalse();
    }

    @Test void rejectsRepositoryAndPublicStoragePaths() {
        for (Path path : new Path[]{Path.of("").toAbsolutePath().resolve("private-vot"),
                Path.of("").toAbsolutePath().getParent(), temporary.resolve("public/media"),
                temporary.resolve("frontend/media"), temporary.resolve("static/media")}) {
            var p = enabled(); p.setStoragePath(path.toString());
            assertThatIllegalStateException().isThrownBy(() -> new LocalVotStorage(p, development()));
        }
        var p = enabled(); p.setStoragePath("relative-vot");
        assertThatIllegalStateException().isThrownBy(() -> new LocalVotStorage(p, development()));
    }

    @Test void acceptsDedicatedRootButRejectsAnUnrelatedExistingDirectory() throws Exception {
        var p = enabled();
        new LocalVotStorage(p, development());
        assertThat(Files.isDirectory(Path.of(p.getStoragePath()))).isTrue();
        Files.writeString(temporary.resolve("media/unrelated.txt"), "do not touch");
        assertThatIllegalStateException().isThrownBy(() -> new LocalVotStorage(p, development()));
        assertThat(Files.readString(temporary.resolve("media/unrelated.txt"))).isEqualTo("do not touch");
    }
    @Test void startupFailureDoesNotExposeConfiguredStorageLocation() {
        var p=enabled();p.setStoragePath("synthetic-sensitive-location"+(char)0);
        assertThatThrownBy(()->new LocalVotStorage(p,development())).isInstanceOf(IllegalStateException.class).satisfies(failure->{
            var trace=new java.io.StringWriter();failure.printStackTrace(new java.io.PrintWriter(trace));
            assertThat(trace.toString()).doesNotContain("synthetic-sensitive-location");
        });
    }

    @Test void rejectsStorageInsideEveryRegisteredGitWorktree() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(Path.of(".git")), "Source archive has no Git metadata");
        Process process = new ProcessBuilder("git", "worktree", "list", "--porcelain").redirectErrorStream(true).start();
        String listing = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        assertThat(process.waitFor()).isZero();
        for (String line : listing.lines().filter(value -> value.startsWith("worktree ")).toList()) {
            var p = enabled(); p.setStoragePath(Path.of(line.substring(9)).resolve("private-vot").toString());
            assertThatIllegalStateException().isThrownBy(() -> new LocalVotStorage(p, development()));
        }
    }

    @Test void rejectsAnUnrelatedGitCheckoutAndSymlinkRoot() throws Exception {
        Path unrelated = temporary.resolve("unrelated"); Files.createDirectories(unrelated.resolve(".git"));
        var p = enabled(); p.setStoragePath(unrelated.resolve("media").toString());
        assertThatIllegalStateException().isThrownBy(() -> new LocalVotStorage(p, development()));
        Path outside = temporary.resolve("outside"); Files.createDirectory(outside);
        Path link = temporary.resolve("link");
        try { Files.createSymbolicLink(link, outside); }
        catch (java.io.IOException | UnsupportedOperationException | SecurityException unavailable) {
            org.junit.jupiter.api.Assumptions.assumeTrue(false, "OS does not permit symlinks");
        }
        var linked = enabled(); linked.setStoragePath(link.resolve("media").toString());
        assertThatIllegalStateException().isThrownBy(() -> new LocalVotStorage(linked, development()));
        assertThat(Files.exists(outside.resolve("media"))).isFalse();
    }

    VotProperties enabled() {
        var p = new VotProperties(); p.setEnabled(true);
        p.setStoragePath(temporary.resolve("media").toString());
        return p;
    }
    static MockEnvironment development() {
        var env = new MockEnvironment().withProperty("tbcall.security.production", "false");
        env.setActiveProfiles("dev"); return env;
    }
}
