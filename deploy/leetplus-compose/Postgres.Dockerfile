FROM ubuntu:24.04@sha256:a61567bd31828687156d735ea8eb01ba4e37636e225dd6a48ba94136a70d9d61
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
# Match the source PostgreSQL major/minor and libc locale. A missing exact
# snapshot package is a build failure, never permission to change DB versions.
RUN printf 'Types: deb\nURIs: https://snapshot.ubuntu.com/ubuntu/20260401T000000Z/\nSuites: noble noble-updates noble-security\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\nCheck-Valid-Until: no\n' > /etc/apt/sources.list.d/leetplus-pg-snapshot.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16=16.13-0ubuntu0.24.04.1 postgresql-client-16=16.13-0ubuntu0.24.04.1 locales ca-certificates \
    && localedef -i en_US -f UTF-8 en_US.UTF-8 \
    && rm -rf /var/lib/apt/lists/* /var/lib/postgresql/16/main
ENV LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
COPY deploy/leetplus-compose/postgres-entry.sh /usr/local/bin/leetplus-postgres
RUN chmod 0555 /usr/local/bin/leetplus-postgres
USER 12030:12030
ENTRYPOINT ["/usr/local/bin/leetplus-postgres"]
