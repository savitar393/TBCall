# Acquisition and offline packaging

Dependency acquisition is a separately approved, connected stage. The runtime scripts do **not** acquire anything. This checkpoint reused the approved local Linux artifacts; no images or dependencies were downloaded. Do not build Linux artifacts from Windows `node_modules` or require an incomplete cache to produce an offline build.

## Pinned inputs

`toolchain.lock.json` records exact versions, image digests, archive hashes and trusted URLs. Required: Linux amd64 Temurin Java 21.0.12.1+1, Apache Maven 3.9.16, Node 24.15.0, pnpm 11.19.0, Next 16.3.8/React 19.3.0 from the existing application lockfile, Playwright + playwright-core 1.62.1 and bundled Chromium revision 1234 / 151.0.7922.34. A differently cached browser revision must not be substituted.

| Input source | Purpose / approximate acquisition size |
|---|---|
| Official Docker Hub Node 24.15.0-bookworm-slim, digest in lock | Linux build/runtime Node; ~80 MB compressed |
| Microsoft Container Registry Playwright v1.62.1-noble, digest in lock | Compatible Linux browser/binaries; ~949 MB compressed |
| Official Docker Hub PostgreSQL 16.15, digest in lock | PostgreSQL and Debian carrier for the Java runtime; already cached in the audited environment |
| registry.npmjs.org exact pnpm/PW/core archives | ~8.8 MB / 0.9 MB / 3.1 MB; SHA256 recorded, npm SRI also verified during F6A.3 acquisition |
| repo.maven.apache.org/maven2 | Eight previously missing JARs below: ~8.9 MB total; exact URLs/bytes/SHA256 in lock |
| Eclipse Adoptium Temurin / Apache Maven official distributions | Existing trusted Java tar and Maven ZIP archive hashes are pinned; this checkpoint did not re-download them |
| Existing `frontend/pnpm-lock.yaml` npm packages | Only frozen versions/integrities; F6A.3 Linux cache ~513 MB, transfers not individually measured |

Eight Maven coordinates: `org.apache.maven.shared:file-management:3.2.0`, `org.codehaus.plexus:plexus-utils:4.0.3`, `org.apache.maven:maven-archiver:3.6.6`, `org.codehaus.plexus:plexus-archiver:4.12.0`, `org.codehaus.plexus:plexus-io:3.6.0`, `org.tukaani:xz:1.12`, `com.github.luben:zstd-jni:1.5.7-9`, `commons-io:commons-io:2.22.0`. These eight alone are not a complete Maven cache; use an already verified full dependency closure. Missing additional artifacts require inventory and approval, not silent acquisition.

Before acquiring on another machine, inventory trusted caches and available disk (reserve at least 10 GiB), review exact missing versions/sources/sizes and obtain that environment's approval. Pull only by the recorded digests; inspect `RepoDigests`, OS and architecture. Verify archive SHA256/SRI before use. Do not alter global installations, the application lockfile or tracked dependencies.

## Connected Linux dependency preparation

In a dedicated, owned build context using the pinned Node image, snapshot frontend source using `git archive` at the approved commit. Unpack verified pnpm 11.19.0 into a task-local prefix. Fetch/install only the frozen application lockfile with scripts disabled, then validate native build steps in Linux. Typical approved acquisition commands inside that temporary Linux context are:

```sh
node /opt/pnpm/bin/pnpm.cjs fetch --frozen-lockfile
node /opt/pnpm/bin/pnpm.cjs install --frozen-lockfile --ignore-scripts
```

The F6A.3 cache could not perform a completely offline install because pnpm needed policy/attestation metadata. Acquisition may therefore require controlled registry access; do not misrepresent it as isolated runtime. After successful frozen installation, export **Linux-created** `node_modules` as `linux-dependencies.tar.gz`, record its SHA256, and detach all acquisition networking before packaging/runtime. Do not export source, `.next`, `.env`, credentials or logs with it. Package PW/core from their verified archives; use the browser already bundled in the pinned image (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`).

The currently reviewed dependency archive SHA is pinned. A freshly exported tar may differ because tar metadata is not byte reproducible; stop and review its lockfile/native provenance and new artifact hash before updating the infrastructure input contract. This is not permission to modify the application dependency/lockfile. Distributing already verified image/archive artifacts through an approved secure cache avoids reacquisition. No private registry or cache credentials belong in the repository.

## Offline build commands

Prepare one task-local input directory with these exact names:

```text
jdk.tar.gz                      # pinned Linux archive; top-level jdk-21.0.12.1+1/
maven.zip                       # pinned Apache distribution
maven-repository/               # full trusted Maven cache (including pinned eight JARs)
linux-dependencies.tar.gz        # pinned Linux pnpm installation only
pnpm-11.19.0.tgz
playwright-1.62.1.tgz
playwright-core-1.62.1.tgz
```

```powershell
& .\test-support\e2e\Prepare-Runtime.ps1 -InputDirectory $approvedInputs
# Use the artifacts.json path printed by preparation:
& .\test-support\e2e\Run-E2E.ps1 -ArtifactManifest $artifactManifest -Mode Full
```

All contexts/build outputs stay under ignored `.local/preparation/<id>/`; Docker's image/build cache retains useful immutable artifacts. Docker builds use `--pull=false --network=none`. Backend packaging uses Maven `-o`, a fixed source epoch, and skips unit tests for this packaging stage (it does not replace backend verification). Frontend packaging runs Linux lint/typecheck/tests/build against completed Linux dependencies. Browser packaging only copies the pinned Node binary and PW/core packages. The runtime uses `--pull never`, fixed image IDs and version/JAR guards. `Prepare-Runtime.ps1` records new image IDs/JAR hash in a local explicit manifest, not an application dependency file.

The offline packaging path is provided for reproducibility but is distinguished from execution with the existing verified images in `REPORT.md`. A fresh clone by itself is not ready: missing approved external artifacts are a prerequisite blocker. No package installation or image download is silently performed by any entry point.
