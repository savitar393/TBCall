# Prepared only. Build context must be an owned baseline snapshot plus approved inputs.
# Invoke docker build --network=none --pull=false; stop on missing dependencies.
ARG JAVA_BASE=postgres@sha256:1a6ab3f5345eb6dbe04a1349529caabdb0ab09293a09590fad07b2246bfa4b54
FROM ${JAVA_BASE} AS package
ADD jdk.tar.gz /opt/
RUN mv /opt/jdk-21.0.12.1+1 /opt/java
COPY maven /opt/maven
COPY maven-repository /m2
COPY backend /work
ENV JAVA_HOME=/opt/java
ENV PATH=/opt/java/bin:$PATH
RUN chmod +x /opt/java/bin/* /opt/java/lib/jspawnhelper /opt/maven/bin/mvn
WORKDIR /work
ARG SOURCE_DATE_EPOCH
RUN /opt/maven/bin/mvn -o -ntp -Dmaven.repo.local=/m2 -Dmaven.test.skip=true -Dproject.build.outputTimestamp=${SOURCE_DATE_EPOCH} clean package

FROM ${JAVA_BASE} AS runtime
COPY --from=package /opt/java /opt/java
COPY --from=package /work/target/tbcall-backend-0.1.0-SNAPSHOT.jar /app/backend.jar
WORKDIR /app
USER 1000:1000
EXPOSE 8080
ENTRYPOINT ["/opt/java/bin/java", "-jar", "/app/backend.jar"]
