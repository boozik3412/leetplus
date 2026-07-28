import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import {
  DesignPartnerProvisioningError,
  normalizeDesignPartnerManifest,
  previewDesignPartnerProvisioning,
  provisionDesignPartner,
  rotateDesignPartnerInvite,
  suspendDesignPartner,
} from "./design-partner-provisioning.mjs";

const HELP = `Usage:
  node scripts/design-partner-provision.cli.mjs <status|provision|rotate-invite|suspend> --manifest <path>

Safety:
  status      read-only; reports whether the dedicated database can provision
  provision   requires DESIGN_PARTNER_CONFIRMATION="PROVISION <tenant-slug>"
  rotate-invite
              requires DESIGN_PARTNER_CONFIRMATION="ROTATE_INVITE <tenant-slug>"
              a unique DESIGN_PARTNER_ROTATION_REQUEST_ID and operation reason
  suspend     requires DESIGN_PARTNER_CONFIRMATION="SUSPEND <tenant-slug>"
              and an incident/operation reason

Every command against an existing tenant requires the independent
DESIGN_PARTNER_MANIFEST_HMAC_KEY. Provision and rotate-invite also require the
exact design-partner runtime safety overlay in their process environment.
The first provision is allowed only when the target database has zero tenants.
Every owner invite URL is emitted once and must be transferred securely.
Provisioning remains SUSPENDED. This command intentionally has no activation
path; credentials may be enabled only by the separately reviewed Gate 1DP flow.
`;

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { help: true };
  }

  const command = argv[0];
  const manifestIndex = argv.indexOf("--manifest");
  const manifestPath =
    manifestIndex >= 0 && manifestIndex + 1 < argv.length
      ? argv[manifestIndex + 1]
      : null;

  if (
    !["status", "provision", "rotate-invite", "suspend"].includes(command) ||
    !manifestPath
  ) {
    throw new Error(HELP);
  }

  return { command, manifestPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  const manifest = normalizeDesignPartnerManifest(
    JSON.parse(await readFile(args.manifestPath, "utf8")),
    new Date(),
    {
      allowExpiredAccess:
        args.command === "status" || args.command === "suspend",
    },
  );
  const prisma = new PrismaClient({ log: [] });

  try {
    const confirmation = process.env.DESIGN_PARTNER_CONFIRMATION;
    const manifestHmacKey = process.env.DESIGN_PARTNER_MANIFEST_HMAC_KEY;
    const result =
      args.command === "status"
        ? await previewDesignPartnerProvisioning(prisma, manifest, {
            manifestHmacKey,
          })
        : args.command === "provision"
          ? await provisionDesignPartner(prisma, manifest, {
              confirmation,
              manifestHmacKey,
              runtimeEnv: process.env,
              webUrl: process.env.WEB_URL,
            })
          : args.command === "rotate-invite"
            ? await rotateDesignPartnerInvite(prisma, manifest, {
                confirmation,
                manifestHmacKey,
                operationReason: process.env.DESIGN_PARTNER_OPERATION_REASON,
                operationTicket: process.env.DESIGN_PARTNER_OPERATION_TICKET,
                requestId: process.env.DESIGN_PARTNER_ROTATION_REQUEST_ID,
                runtimeEnv: process.env,
                webUrl: process.env.WEB_URL,
              })
            : await suspendDesignPartner(prisma, manifest, {
                confirmation,
                manifestHmacKey,
                operationReason: process.env.DESIGN_PARTNER_OPERATION_REASON,
                operationTicket: process.env.DESIGN_PARTNER_OPERATION_TICKET,
              });

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const code =
    error instanceof DesignPartnerProvisioningError
      ? error.code
      : "UNEXPECTED_ERROR";
  process.stderr.write(
    `${JSON.stringify({ ok: false, code, message: error.message })}\n`,
  );
  process.exitCode = 1;
});
