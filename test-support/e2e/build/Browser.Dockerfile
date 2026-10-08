FROM docker.io/library/node@sha256:152aceace5c03e2597988763165ee33e3fd3633636db0fc983cd2e126b02cfde AS node_runtime
FROM mcr.microsoft.com/playwright@sha256:c091b21d9fae78c76e85cd4356431e9b018402f172a214fc7d7a5e9a7e29d8ac AS runtime
COPY --from=node_runtime /usr/local/bin/node /opt/node/bin/node
COPY --chown=pwuser:pwuser runner /runner
ENV PATH=/opt/node/bin:$PATH
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /runner
USER pwuser
ENTRYPOINT ["/opt/node/bin/node"]
