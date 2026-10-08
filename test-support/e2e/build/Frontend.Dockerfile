# Linux inputs only; .next/node_modules must never come from the Windows workspace.
FROM docker.io/library/node@sha256:152aceace5c03e2597988763165ee33e3fd3633636db0fc983cd2e126b02cfde AS build
COPY pnpm /opt/pnpm
COPY frontend /work
ADD linux-dependencies.tar.gz /work/
WORKDIR /work
ENV NEXT_TELEMETRY_DISABLED=1
ENV pnpm_config_verify_deps_before_run=error
ENV CI=true
RUN node /opt/pnpm/bin/pnpm.cjs rebuild --pending
RUN node /opt/pnpm/bin/pnpm.cjs run lint
RUN node /opt/pnpm/bin/pnpm.cjs run typecheck
RUN node /opt/pnpm/bin/pnpm.cjs test
RUN node /opt/pnpm/bin/pnpm.cjs run build

FROM docker.io/library/node@sha256:152aceace5c03e2597988763165ee33e3fd3633636db0fc983cd2e126b02cfde AS runtime
# No standalone output is configured in the approved application. Retain its Linux
# dependency tree in this audit artifact; this is not a production image optimization.
COPY --from=build --chown=node:node /work /app
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
USER node
EXPOSE 3000
ENTRYPOINT ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
