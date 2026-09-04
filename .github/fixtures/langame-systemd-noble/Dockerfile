FROM ubuntu:24.04@sha256:1e0a86e57d247923571b75e0aaf48a1449cf8c543d51fb3e07a4a7d7bfa79316

ARG DEBIAN_FRONTEND=noninteractive
ARG FIXTURE_SOURCE_SHA
ARG UBUNTU_SNAPSHOT=20260818T000000Z
ARG BOOTSTRAP_CA_BUNDLE_SHA256
ARG SNAPSHOT_SOURCES_SHA256

LABEL org.opencontainers.image.source="https://github.com/boozik3412/leetplus" \
      org.opencontainers.image.revision="${FIXTURE_SOURCE_SHA}" \
      org.opencontainers.image.base.name="docker.io/library/ubuntu:24.04" \
      org.opencontainers.image.base.digest="sha256:1e0a86e57d247923571b75e0aaf48a1449cf8c543d51fb3e07a4a7d7bfa79316" \
      org.opencontainers.image.version="ubuntu-24.04-systemd-255.4-1ubuntu8.17-dbus-1.14.10-4ubuntu4.1" \
      io.leetplus.fixture="langame-booted-systemd-base-v1" \
      io.leetplus.fixture.ubuntu-snapshot="${UBUNTU_SNAPSHOT}" \
      io.leetplus.fixture.bootstrap-ca-bundle-sha256="${BOOTSTRAP_CA_BUNDLE_SHA256}" \
      io.leetplus.fixture.snapshot-sources-sha256="${SNAPSHOT_SOURCES_SHA256}"

COPY bootstrap-ca-certificates.crt /tmp/bootstrap-ca-certificates.crt
COPY ubuntu-snapshot.sources /tmp/ubuntu-snapshot.sources

# Canonical Noble apt understands --snapshot natively. Network is permitted
# only while this project-owned base is built once; consumer gates pull its
# immutable manifest digest and run/build their overlay with network=none.
RUN test "$(sha256sum /tmp/bootstrap-ca-certificates.crt | awk '{print $1}')" \
      = "${BOOTSTRAP_CA_BUNDLE_SHA256}" \
    && test "$(sha256sum /tmp/ubuntu-snapshot.sources | awk '{print $1}')" \
      = "${SNAPSHOT_SOURCES_SHA256}" \
    && install -d -o root -g root -m 0755 /etc/ssl/certs \
    && install -o root -g root -m 0444 /tmp/bootstrap-ca-certificates.crt \
      /etc/ssl/certs/ca-certificates.crt \
    && rm -f /etc/apt/sources.list /etc/apt/sources.list.d/* \
    && install -o root -g root -m 0444 /tmp/ubuntu-snapshot.sources \
      /etc/apt/sources.list.d/ubuntu.sources \
    && grep -F -x "URIs: https://snapshot.ubuntu.com/ubuntu/${UBUNTU_SNAPSHOT}/" \
      /etc/apt/sources.list.d/ubuntu.sources \
    && ! grep -R -E 'archive\.ubuntu\.com|security\.ubuntu\.com' \
      /etc/apt/sources.list.d \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      dbus=1.14.10-4ubuntu4.1 \
      libnss-systemd=255.4-1ubuntu8.17 \
      passwd \
      procps \
      systemd=255.4-1ubuntu8.17 \
      systemd-sysv=255.4-1ubuntu8.17 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/bootstrap-ca-certificates.crt \
      /tmp/ubuntu-snapshot.sources \
    && test -s /etc/ssl/certs/ca-certificates.crt \
    && test "$(dpkg-query -W -f='${Version}' systemd)" = 255.4-1ubuntu8.17 \
    && test "$(dpkg-query -W -f='${Version}' dbus)" = 1.14.10-4ubuntu4.1

COPY leetplus-langame-fixture.target /usr/lib/systemd/system/leetplus-langame-fixture.target

RUN chown root:root /usr/lib/systemd/system/leetplus-langame-fixture.target \
    && chmod 0444 /usr/lib/systemd/system/leetplus-langame-fixture.target \
    && groupadd --system leetplus-runtime \
    && groupadd --system leetplus-api-runtime \
    && : > /etc/machine-id \
    && install -d -o root -g root -m 0755 \
      /etc/nginx \
      /etc/systemd/system \
      /srv \
      /usr/local/libexec \
      /usr/share/leetplus-langame-fixture \
      /var/lib/leetplus \
      /var/lib/systemd/timers \
    && dpkg-query -W -f='${binary:Package}=${Version}\n' \
      | LC_ALL=C sort > /usr/share/leetplus-langame-fixture/dpkg-packages.txt \
    && sha256sum /usr/share/leetplus-langame-fixture/dpkg-packages.txt \
      > /usr/share/leetplus-langame-fixture/dpkg-packages.sha256 \
    && chmod 0444 /usr/share/leetplus-langame-fixture/dpkg-packages.txt \
      /usr/share/leetplus-langame-fixture/dpkg-packages.sha256 \
    && ln -sfn /usr/lib/systemd/system/leetplus-langame-fixture.target /usr/lib/systemd/system/default.target \
    && test -L /usr/lib/systemd/system/sockets.target.wants/dbus.socket \
    && test "$(readlink -f /usr/lib/systemd/system/sockets.target.wants/dbus.socket)" = /usr/lib/systemd/system/dbus.socket

STOPSIGNAL SIGRTMIN+3
ENTRYPOINT ["/sbin/init"]
