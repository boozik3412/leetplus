const DISPOSABLE_DATABASE_NAME = "leetplus_ci";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const TARGET_ERROR =
  "Design-partner smoke requires the exact disposable loopback database.";

export function assertDesignPartnerSmokeDatabaseTarget(value) {
  let target;
  try {
    target = new URL(value);
  } catch {
    throw new Error(TARGET_ERROR);
  }

  const databaseName = decodeURIComponent(target.pathname.slice(1));
  const parameters = [...target.searchParams.entries()];
  if (
    !["postgresql:", "postgres:"].includes(target.protocol) ||
    !LOOPBACK_HOSTS.has(target.hostname.toLowerCase()) ||
    databaseName !== DISPOSABLE_DATABASE_NAME ||
    parameters.length !== 1 ||
    parameters[0][0] !== "schema" ||
    parameters[0][1] !== "public"
  ) {
    throw new Error(TARGET_ERROR);
  }
}
