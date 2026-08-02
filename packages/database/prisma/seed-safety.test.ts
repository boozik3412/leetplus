import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertDemoSeedEnvironment,
  assertExistingTenantResetAllowed,
  createDemoSeedCredentials,
  inspectSeedDatabaseTarget,
  resolveDemoSeedTenantSlug,
} from "./seed-safety";

const localTarget = inspectSeedDatabaseTarget(
  "postgresql://user:secret@127.0.0.1:5432/leetplus_dev?schema=public",
);
const enabledDevelopmentEnvironment = {
  DEMO_SEED_ENABLED: "true",
  DEMO_SEED_TARGET_ENVIRONMENT: "development",
};

describe("demo seed safety", () => {
  it("allows an explicitly enabled loopback development database", () => {
    assert.doesNotThrow(() =>
      assertDemoSeedEnvironment(enabledDevelopmentEnvironment, localTarget),
    );
  });

  it("refuses a seed that was not explicitly enabled", () => {
    assert.throws(
      () => assertDemoSeedEnvironment({}, localTarget),
      /DEMO_SEED_ENABLED=true/,
    );
  });

  it("requires a positive non-production environment attestation", () => {
    assert.throws(
      () =>
        assertDemoSeedEnvironment(
          { DEMO_SEED_ENABLED: "true" },
          localTarget,
        ),
      /DEMO_SEED_TARGET_ENVIRONMENT=development/,
    );
  });

  it("refuses production environment aliases without an override", () => {
    for (const environment of [
      { NODE_ENV: "production" },
      { APP_ENV: "prod" },
      { DEPLOY_ENV: "live" },
    ]) {
      assert.throws(
        () =>
          assertDemoSeedEnvironment(
            { ...enabledDevelopmentEnvironment, ...environment },
            localTarget,
          ),
        /production environment/,
      );
    }
  });

  it("refuses a database target with a production marker", () => {
    const productionTarget = inspectSeedDatabaseTarget(
      "postgresql://user:secret@prod-db.internal:5432/leetplus?schema=public",
    );

    assert.throws(
      () =>
        assertDemoSeedEnvironment(
          {
            ...enabledDevelopmentEnvironment,
            DEMO_SEED_ALLOW_REMOTE_DATABASE: "true",
            DEMO_SEED_DATABASE_FINGERPRINT: productionTarget.fingerprint,
          },
          productionTarget,
        ),
      /production marker/,
    );
  });

  it("requires an exact fingerprint for a remote development database", () => {
    const remoteTarget = inspectSeedDatabaseTarget(
      "postgresql://user:secret@dev-db.internal:5432/leetplus?schema=public",
    );

    assert.throws(
      () =>
        assertDemoSeedEnvironment(
          enabledDevelopmentEnvironment,
          remoteTarget,
        ),
      /not a loopback database/,
    );
    assert.throws(
      () =>
        assertDemoSeedEnvironment(
          {
            ...enabledDevelopmentEnvironment,
            DEMO_SEED_ALLOW_REMOTE_DATABASE: "true",
            DEMO_SEED_DATABASE_FINGERPRINT: "wrong-target",
          },
          remoteTarget,
        ),
      /fingerprint confirmation/,
    );
    assert.doesNotThrow(() =>
      assertDemoSeedEnvironment(
        {
          ...enabledDevelopmentEnvironment,
          DEMO_SEED_ALLOW_REMOTE_DATABASE: "true",
          DEMO_SEED_DATABASE_FINGERPRINT: remoteTarget.fingerprint,
        },
        remoteTarget,
      ),
    );
  });

  it("requires reset, database, and tenant confirmations before reset", () => {
    const tenant = { id: "tenant-local-123", slug: "local-demo" };

    assert.throws(
      () => assertExistingTenantResetAllowed({}, localTarget, tenant),
      /refused to reset existing tenant/,
    );
    assert.doesNotThrow(() =>
      assertExistingTenantResetAllowed(
        {
          DEMO_SEED_RESET_EXISTING: "true",
          DEMO_SEED_DATABASE_FINGERPRINT: localTarget.fingerprint,
          DEMO_SEED_CONFIRM_TENANT_ID: tenant.id,
        },
        localTarget,
        tenant,
      ),
    );
  });

  it("generates different strong local credentials for every run", () => {
    const first = createDemoSeedCredentials({});
    const second = createDemoSeedCredentials({});

    assert.notEqual(first.email, second.email);
    assert.notEqual(first.password, second.password);
    assert.ok(first.password.length >= 16);
    assert.equal(first.generatedEmail, true);
    assert.equal(first.generatedPassword, true);
  });

  it("validates explicitly configured credentials and tenant slug", () => {
    assert.deepEqual(
      createDemoSeedCredentials({
        DEMO_SEED_OWNER_EMAIL: "developer@example.test",
        DEMO_SEED_OWNER_PASSWORD: "a-local-password-with-20-characters",
      }),
      {
        email: "developer@example.test",
        password: "a-local-password-with-20-characters",
        generatedEmail: false,
        generatedPassword: false,
      },
    );
    assert.equal(resolveDemoSeedTenantSlug({}), "local-demo");
    assert.equal(
      resolveDemoSeedTenantSlug({ DEMO_SEED_TENANT_SLUG: "qa-demo-2" }),
      "qa-demo-2",
    );
    assert.throws(
      () =>
        resolveDemoSeedTenantSlug({
          DEMO_SEED_TENANT_SLUG: "Production Demo",
        }),
      /lowercase URL-safe slug/,
    );
    assert.throws(
      () => resolveDemoSeedTenantSlug({ DEMO_SEED_TENANT_SLUG: "demo" }),
      /reserved/,
    );
    assert.throws(
      () =>
        resolveDemoSeedTenantSlug({
          DEMO_SEED_TENANT_SLUG: "public-demo",
        }),
      /reserved/,
    );
  });
});
