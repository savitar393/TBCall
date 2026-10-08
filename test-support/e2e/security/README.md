# Approved browser-only seccomp profile

`moby-default.json` is pinned official Moby commit `6fe7deb1b9fb7c0397a4593480d7d22b9ee8caef`:
`https://raw.githubusercontent.com/moby/profiles/6fe7deb1b9fb7c0397a4593480d7d22b9ee8caef/seccomp/default.json`.
SHA256: `6416b47770785a41ac59073cdc77d9fe98517df2799dc83ef207e622de3053f6`.

`browser-seccomp.json` is the exact F6A.3 profile separately approved by the user, SHA256:
`688e4282e75b43d8f7483c69f47178cbe106e297969c7da8c64e3f5b9f2854b8`.
All original rules/settings remain byte-equivalent as JSON values. Two appended rules allow only `clone`, `setns`, `unshare` and `chroot`, necessary for the observed Chromium namespace sandbox startup. Static checks compare the entire original structure and additions, not only filenames.

Exact equivalence with this Docker daemon's implicit default remains unverified; the pinned official baseline is explicit. The approved additions increase namespace syscall exposure. They apply only to new owned browser/control containers, retaining non-root, cap-drop ALL, no-new-privileges, read-only root, private IPC, internal networking and Chromium sandboxing. No privileged mode, SYS_ADMIN, host networking, seccomp-unconfined or browser --no-sandbox is permitted. A future failure requires diagnosis/approval, not silent profile widening.
