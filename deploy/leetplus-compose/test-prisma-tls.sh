#!/usr/bin/env bash
set -euo pipefail
api=${1:?exact API image ID required}
postgres=${2:?exact PostgreSQL image ID required}
output=${3:?output report required}
[[ "$api" =~ ^sha256:[a-f0-9]{64}$ && "$postgres" =~ ^sha256:[a-f0-9]{64}$ ]]
tmp=$(mktemp -d)
name="leetplus-tls-${GITHUB_RUN_ID:-$$}"
cleanup() {
  docker rm --force "$name" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
  # This exact mktemp directory contains synthetic CI keys only.
  rm -f "$tmp/key.pem" "$tmp/cert.pem" "$tmp/bad-key.pem" "$tmp/bad-cert.pem"
  rmdir "$tmp"
}
trap cleanup EXIT
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=postgres \
  -addext subjectAltName=DNS:postgres -keyout "$tmp/key.pem" -out "$tmp/cert.pem" 2>/dev/null
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=untrusted-ci-root \
  -keyout "$tmp/bad-key.pem" -out "$tmp/bad-cert.pem" 2>/dev/null
chmod 0755 "$tmp"
chmod 0644 "$tmp/cert.pem" "$tmp/bad-cert.pem"
chmod 0600 "$tmp/key.pem"
sudo chown 12030:12030 "$tmp/key.pem"
docker network create --internal "$name" >/dev/null
fixture_cidr=$(docker network inspect --format '{{(index .IPAM.Config 0).Subnet}}' "$name")
[[ "$fixture_cidr" =~ ^[0-9./]+$ ]]
docker run --detach --name "$name" --network "$name" --network-alias postgres --network-alias wrong-postgres \
  --read-only --cap-drop ALL --security-opt no-new-privileges --user 12030:12030 \
  --tmpfs /tmp:rw,nosuid,nodev,mode=1777,size=536870912 \
  --mount "type=bind,source=$tmp,target=/tls,readonly" -e "FIXTURE_CIDR=$fixture_cidr" --entrypoint /bin/bash "$postgres" -ec '
    export PATH=/usr/lib/postgresql/16/bin:$PATH
    initdb -D /tmp/pg -U postgres --locale=en_US.UTF-8 -A trust >/tmp/init.log
    printf "hostssl postgres leetplus_runtime %s trust\n" "$FIXTURE_CIDR" >>/tmp/pg/pg_hba.conf
    pg_ctl -D /tmp/pg -o "-h 0.0.0.0 -k /tmp -c ssl=on -c ssl_cert_file=/tls/cert.pem -c ssl_key_file=/tls/key.pem" -l /tmp/pg.log -w start
    psql -h /tmp -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE leetplus_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;"
    touch /tmp/ready
    exec tail -f /dev/null
  ' >/dev/null
ready=false
for attempt in $(seq 1 30); do
  if docker exec "$name" test -f /tmp/ready; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then docker logs "$name"; exit 1; fi
docker run --rm --network "$name" --read-only --cap-drop ALL --security-opt no-new-privileges \
  --mount "type=bind,source=$tmp,target=/tls,readonly" --entrypoint node "$api" -e '
const {PrismaClient}=require(require.resolve("@prisma/client",{paths:["/app/apps/api"]}));
const {loadGuestBonusLedgerWorkerConfig}=require("/app/apps/api/dist/guest-gamification/guest-bonus-ledger-worker.js");
loadGuestBonusLedgerWorkerConfig({
 DATABASE_URL:"postgresql://leetplus_runtime:synthetic-only@postgres:5432/leetplus?schema=public&connection_limit=2&pool_timeout=5&connect_timeout=5&sslmode=require&sslcert=/run/secrets/db-ca.pem&sslaccept=strict",
 GUEST_BONUS_LEDGER_WORKER_ENABLED:"true",GUEST_BONUS_LEDGER_WORKER_TENANT_SLUG:"demo",
 GUEST_BONUS_LEDGER_WORKER_DRY_RUN:"true",GUEST_BONUS_LEDGER_WORKER_CANARY:"true",
 GUEST_BONUS_LEDGER_WORKER_LIMIT:"1",LANGAME_BONUS_ACCRUAL_ENABLED:"false"
});
async function probe(host,certificate,expected){
 const url=`postgresql://leetplus_runtime:synthetic-only@${host}:5432/postgres?schema=public&connection_limit=1&pool_timeout=3&connect_timeout=3&sslmode=require&sslcert=/tls/${certificate}&sslaccept=strict`;
 const client=new PrismaClient({datasources:{db:{url}}});
 let accepted=false;
 try { const rows=await client.$queryRawUnsafe("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()");accepted=rows[0]?.ssl===true; }
 catch(error) { if(expected) console.error(String(error.message).replaceAll("synthetic-only","[fixture]")); }
 finally { await client.$disconnect(); }
 if(accepted!==expected) throw new Error(`TLS policy did not enforce expected result for ${host}/${certificate}`);
}
(async()=>{await probe("postgres","cert.pem",true);await probe("postgres","bad-cert.pem",false);await probe("wrong-postgres","cert.pem",false);console.log(JSON.stringify({decision:"PASS",driver:"Prisma6",tlsRequired:true,badCaRejected:true,badHostnameRejected:true,nativeWorkerProfileAccepted:true}));})().catch(e=>{console.error(e.message);process.exitCode=1});
' > "$output"
