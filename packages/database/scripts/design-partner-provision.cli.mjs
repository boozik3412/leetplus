import { readFile } from "node:fs/promises";
import {
  DesignPartnerProvisioningError,
  normalizeDesignPartnerManifest,
  previewDesignPartnerProvisioning,
  suspendDesignPartner,
} from "./design-partner-provisioning.mjs";

const DESIGN_PARTNER_IDENTITY_WRITER_DISABLED_CODE =
  "DESIGN_PARTNER_IDENTITY_WRITER_DISABLED";
const IDENTITY_WRITER_DISABLED_MESSAGE =
  "Design-partner identity writes are disabled pending the shared sealed identity activation workflow.";

const HELP = `Usage:
  node scripts/design-partner-provision.cli.mjs <status|provision|rotate-invite|suspend> --manifest <path>

Safety:
  status      read-only; inspects historical isolated topology
  provision   DISABLED pending shared sealed identity activation
  rotate-invite
              DISABLED pending shared sealed identity activation
  suspend     requires DESIGN_PARTNER_CONFIRMATION="SUSPEND <tenant-slug>"
              and an incident/operation reason

The provision and rotate-invite commands always fail closed with
DESIGN_PARTNER_IDENTITY_WRITER_DISABLED before reading a manifest or
constructing a database client. Identity creation and invite rotation may resume
only through the separately reviewed shared sealed identity activation flow.

Status remains read-only. Status and emergency suspend against historical
isolated topology require the independent DESIGN_PARTNER_MANIFEST_HMAC_KEY.
This command intentionally has no activation path.
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

  const disabledIdentityWriter =
    command === "provision" || command === "rotate-invite";
  if (
    !["status", "provision", "rotate-invite", "suspend"].includes(command) ||
    (!disabledIdentityWriter && !manifestPath)
  ) {
    throw new Error(HELP);
  }

  return { command, manifestPath };
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  if (args.command === "provision" || args.command === "rotate-invite") {
    throw new DesignPartnerProvisioningError(
      DESIGN_PARTNER_IDENTITY_WRITER_DISABLED_CODE,
      IDENTITY_WRITER_DISABLED_MESSAGE,
    );
  }

  const manifest = normalizeDesignPartnerManifest(
    JSON.parse(await readFile(args.manifestPath, "utf8")),
    new Date(),
    {
      allowExpiredAccess:
        args.command === "status" || args.command === "suspend",
    },
  );
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ log: [] });

  try {
    const confirmation = process.env.DESIGN_PARTNER_CONFIRMATION;
    const manifestHmacKey = process.env.DESIGN_PARTNER_MANIFEST_HMAC_KEY;
    const result =
      args.command === "status"
        ? await previewDesignPartnerProvisioning(prisma, manifest, {
            manifestHmacKey,
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
