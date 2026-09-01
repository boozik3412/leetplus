#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../../..");
const DEFAULT_CONTRACT = path.join(
  DEFAULT_ROOT,
  "docs/deployment/production-artifact/production-topology-contract.json",
);

function fail(message) {
  throw new Error(`production topology contract: ${message}`);
}

function parseArguments(argv) {
  let root = DEFAULT_ROOT;
  let contract = DEFAULT_CONTRACT;
  let liveNssPhase = null;
  let liveSystemd = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      root = path.resolve(argv[index + 1] ?? fail("--root requires a path"));
      index += 1;
    } else if (argument === "--contract") {
      contract = path.resolve(argv[index + 1] ?? fail("--contract requires a path"));
      index += 1;
    } else if (argument === "--live-nss-phase") {
      liveNssPhase = argv[index + 1] ?? fail("--live-nss-phase requires a phase");
      index += 1;
    } else if (argument === "--live-systemd") {
      liveSystemd = true;
    } else {
      fail(`unknown argument ${argument}`);
    }
  }
  if (liveNssPhase !== null && !["steady-state", "restored-copy-acceptance"].includes(liveNssPhase)) {
    fail("--live-nss-phase must be steady-state or restored-copy-acceptance");
  }
  if (liveSystemd && liveNssPhase !== "steady-state") {
    fail("--live-systemd requires --live-nss-phase steady-state");
  }
  return { root, contract, liveNssPhase, liveSystemd };
}

function readFile(filePath, label) {
  let value;
  try {
    value = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    fail(`${label} cannot be read: ${error.message}`);
  }
  return value;
}

function readRepositoryFile(root, relativePath) {
  if (path.isAbsolute(relativePath) || relativePath.includes("..")) {
    fail(`repository path is unsafe: ${relativePath}`);
  }
  const value = readFile(path.join(root, relativePath), relativePath);
  const normalized = value.replaceAll("\r\n", "\n");
  if (normalized.includes("\r")) fail(`${relativePath} contains a bare carriage return`);
  return normalized;
}

function exactKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} keys must be exactly ${expected.join(", ")}`);
  }
}

function exactArray(value, expected, label) {
  if (!Array.isArray(value) || JSON.stringify(value) !== JSON.stringify(expected)) {
    fail(`${label} must be exactly ${JSON.stringify(expected)}`);
  }
  if (new Set(value).size !== value.length) fail(`${label} contains duplicates`);
}

function exactValue(value, expected, label) {
  if (value !== expected) fail(`${label} must be ${JSON.stringify(expected)}`);
}

function positivePort(value, label) {
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    fail(`${label} must be an unprivileged TCP port`);
  }
}

function include(source, fragment, label) {
  if (!source.includes(fragment)) fail(`${label} drifted from the topology contract`);
}

function unitEnvironmentFiles(unitText) {
  return unitText
    .split("\n")
    .filter((line) => line.startsWith("EnvironmentFile="))
    .map((line) => line.slice("EnvironmentFile=".length));
}

const LIVE_COMMAND_ENVIRONMENT = Object.freeze({
  PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  TZ: "UTC",
});

function runLiveCommand(command, args, label, { acceptedStatuses = [0] } = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: LIVE_COMMAND_ENVIRONMENT,
    maxBuffer: 1024 * 1024,
    timeout: 15_000,
  });
  if (result.error) fail(`${label} could not execute: ${result.error.message}`);
  if (result.signal !== null) fail(`${label} was terminated by ${result.signal}`);
  if (!acceptedStatuses.includes(result.status)) {
    const stderr = (result.stderr ?? "").trim().slice(0, 512);
    fail(`${label} exited ${result.status}${stderr ? `: ${stderr}` : ""}`);
  }
  const stdout = (result.stdout ?? "").replaceAll("\r\n", "\n");
  if (stdout.includes("\r") || stdout.length > 1024 * 1024) fail(`${label} output is non-canonical or unbounded`);
  return { status: result.status, stdout };
}

function parseColonInventory(raw, fieldCount, label) {
  const records = raw
    .trimEnd()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const fields = line.split(":");
      if (fields.length !== fieldCount) fail(`${label} contains a malformed record`);
      return fields;
    });
  if (records.length === 0 || records.length > 100_000) fail(`${label} is empty or unbounded`);
  return records;
}

function oneInventoryRecord(records, index, value, label) {
  const matches = records.filter((record) => record[index] === value);
  if (matches.length !== 1) fail(`${label} must resolve to exactly one record`);
  return matches[0];
}

function sortedUnique(values, label) {
  const sorted = [...values].sort();
  if (new Set(sorted).size !== sorted.length) fail(`${label} contains duplicates`);
  return sorted;
}

function validateLiveNss(contract, phase) {
  if (process.platform !== "linux" || typeof process.getuid !== "function" || process.getuid() !== 0) {
    fail("live NSS verification is Linux/root-only");
  }
  const passwdRecords = parseColonInventory(
    runLiveCommand("/usr/bin/getent", ["passwd"], "complete passwd inventory").stdout,
    7,
    "passwd inventory",
  );
  const groupRecords = parseColonInventory(
    runLiveCommand("/usr/bin/getent", ["group"], "complete group inventory").stdout,
    4,
    "group inventory",
  );
  const runtime = contract.runtimeIdentity;
  const rehearsal = contract.transientPhases.restoredCopyAcceptance;
  const groupIds = new Map();

  for (const [groupName, groupContract] of Object.entries(runtime.groups)) {
    const record = oneInventoryRecord(groupRecords, 0, groupName, `group ${groupName}`);
    const [, password, gidText, membersText] = record;
    if (password !== "x" || !/^[1-9][0-9]*$/.test(gidText)) fail(`group ${groupName} identity is invalid`);
    oneInventoryRecord(groupRecords, 2, gidText, `group GID ${gidText}`);
    groupIds.set(groupName, gidText);
    const expectedMembers =
      phase === "restored-copy-acceptance" && groupName === runtime.primaryGroup
        ? [rehearsal.serviceUser]
        : groupContract.explicitMembers;
    const actualMembers = membersText === "" ? [] : membersText.split(",");
    exactArray(sortedUnique(actualMembers, `${groupName} live members`), expectedMembers, `${groupName}.liveExplicitMembers`);
  }

  for (const [groupName, groupContract] of Object.entries(runtime.groups)) {
    const actualPrimaryUsers = passwdRecords
      .filter((record) => record[3] === groupIds.get(groupName))
      .map((record) => record[0])
      .sort();
    exactArray(actualPrimaryUsers, groupContract.primaryUsers, `${groupName}.livePrimaryUsers`);
  }

  const expectedRuntimeUsers = runtime.groups[runtime.primaryGroup].primaryUsers;
  const runtimeGid = groupIds.get(runtime.primaryGroup);

  for (const userName of expectedRuntimeUsers) {
    const record = oneInventoryRecord(passwdRecords, 0, userName, `user ${userName}`);
    const [, password, uidText, gidText, gecos, home, shell] = record;
    if (
      password !== "x" ||
      !/^[1-9][0-9]*$/.test(uidText) ||
      gidText !== runtimeGid ||
      gecos !== "" ||
      home !== "/nonexistent" ||
      shell !== "/usr/sbin/nologin" ||
      fs.existsSync(home)
    ) {
      fail(`user ${userName} identity/home/shell is invalid`);
    }
    oneInventoryRecord(passwdRecords, 2, uidText, `user UID ${uidText}`);
    const kind = userName.startsWith("leetplus-api-") ? "api" : "web";
    const expectedGroups = [runtime.primaryGroup, `leetplus-${kind}-runtime`].sort();
    const actualGroups = runLiveCommand("/usr/bin/id", ["-nG", userName], `groups for ${userName}`)
      .stdout.trim()
      .split(/\s+/)
      .filter(Boolean)
      .sort();
    exactArray(actualGroups, expectedGroups, `${userName}.liveGroups`);
  }

  const rehearsalPasswd = runLiveCommand(
    "/usr/bin/getent",
    ["passwd", rehearsal.serviceUser],
    "rehearsal passwd lookup",
    { acceptedStatuses: [0, 2] },
  );
  const rehearsalGroup = runLiveCommand(
    "/usr/bin/getent",
    ["group", rehearsal.primaryGroup],
    "rehearsal group lookup",
    { acceptedStatuses: [0, 2] },
  );
  if (phase === "steady-state") {
    if (rehearsalPasswd.status !== 2 || rehearsalGroup.status !== 2) {
      fail("restored-copy rehearsal identity must be absent in steady state");
    }
    return;
  }

  if (rehearsalPasswd.status !== 0 || rehearsalGroup.status !== 0) {
    fail("restored-copy rehearsal identity is absent during its transient phase");
  }
  const rehearsalUserRecord = rehearsalPasswd.stdout.trim().split(":");
  const rehearsalGroupRecord = rehearsalGroup.stdout.trim().split(":");
  if (
    rehearsalUserRecord.length !== 7 ||
    rehearsalGroupRecord.length !== 4 ||
    rehearsalUserRecord[0] !== rehearsal.serviceUser ||
    rehearsalUserRecord[3] !== rehearsalGroupRecord[2] ||
    rehearsalUserRecord[5] !== "/nonexistent" ||
    rehearsalUserRecord[6] !== "/usr/sbin/nologin" ||
    rehearsalGroupRecord[0] !== rehearsal.primaryGroup ||
    rehearsalGroupRecord[3] !== ""
  ) {
    fail("restored-copy rehearsal primary identity is invalid");
  }
  const rehearsalGroups = runLiveCommand(
    "/usr/bin/id",
    ["-nG", rehearsal.serviceUser],
    "rehearsal group set",
  )
    .stdout.trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort();
  exactArray(rehearsalGroups, [...rehearsal.exactGroups].sort(), "restoredCopyAcceptance.liveGroups");
}

function parseSystemdProperties(raw, unit) {
  const properties = new Map();
  for (const line of raw.trimEnd().split("\n")) {
    const separator = line.indexOf("=");
    if (separator < 1) fail(`${unit} returned a malformed systemd property`);
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (properties.has(key)) {
      if (key !== "EnvironmentFiles") fail(`${unit} returned duplicate systemd property ${key}`);
      properties.set(key, `${properties.get(key)}\n${value}`);
    } else {
      properties.set(key, value);
    }
  }
  return properties;
}

function validateLiveSystemd(contract) {
  for (const slot of ["blue", "green"]) {
    for (const kind of ["api", "web"]) {
      const template = contract.systemdTemplates[kind];
      const slotContract = contract.slots[slot];
      const unit = `leetplus-${kind}@${slot}.service`;
      const properties = parseSystemdProperties(
        runLiveCommand(
          "/usr/bin/systemctl",
          [
            "show",
            "--all",
            "--no-pager",
            "--property=ActiveState,SubState,Result,MainPID,User,Group,EnvironmentFiles",
            unit,
          ],
          `systemd properties for ${unit}`,
        ).stdout,
        unit,
      );
      exactValue(properties.get("ActiveState"), "active", `${unit}.ActiveState`);
      exactValue(properties.get("SubState"), "running", `${unit}.SubState`);
      exactValue(properties.get("Result"), "success", `${unit}.Result`);
      exactValue(properties.get("User"), slotContract[`${kind}User`], `${unit}.User`);
      exactValue(properties.get("Group"), template.primaryGroup, `${unit}.Group`);
      const expectedEnvironmentFiles = template.environmentFiles.map((entry) => entry.replaceAll("%i", slot));
      const actualEnvironmentFiles = properties.get("EnvironmentFiles")?.match(/\/[A-Za-z0-9._%/@+-]+/g) ?? [];
      exactArray(actualEnvironmentFiles, expectedEnvironmentFiles, `${unit}.EnvironmentFiles`);
      const mainPidText = properties.get("MainPID");
      if (!/^[1-9][0-9]*$/.test(mainPidText ?? "")) fail(`${unit}.MainPID is invalid`);
      const mainPid = Number(mainPidText);
      const status = readFile(`/proc/${mainPid}/status`, `${unit} process status`).replaceAll("\r\n", "\n");
      const uidText = oneInventoryRecord(
        parseColonInventory(runLiveCommand("/usr/bin/getent", ["passwd", slotContract[`${kind}User`]], `${unit} passwd`).stdout, 7, `${unit} passwd`),
        0,
        slotContract[`${kind}User`],
        `${unit} user`,
      )[2];
      const primaryGid = runLiveCommand("/usr/bin/getent", ["group", template.primaryGroup], `${unit} primary group`)
        .stdout.trim()
        .split(":")[2];
      const supplementaryGid = runLiveCommand(
        "/usr/bin/getent",
        ["group", template.supplementaryGroup],
        `${unit} supplementary group`,
      )
        .stdout.trim()
        .split(":")[2];
      const uidLine = status.match(/^Uid:\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)$/m);
      const gidLine = status.match(/^Gid:\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)$/m);
      const groupsLine = status.match(/^Groups:\s*(.*)$/m);
      if (
        uidLine === null ||
        gidLine === null ||
        groupsLine === null ||
        uidLine.slice(1).some((value) => value !== uidText) ||
        gidLine.slice(1).some((value) => value !== primaryGid)
      ) {
        fail(`${unit} process UID/GID identity is invalid`);
      }
      const processGroups = groupsLine[1].trim().split(/\s+/).filter(Boolean);
      if (
        !processGroups.includes(supplementaryGid) ||
        processGroups.some((value) => value !== primaryGid && value !== supplementaryGid)
      ) {
        fail(`${unit} process supplementary groups are invalid`);
      }
      const port = slotContract[`${kind}Port`];
      const listener = runLiveCommand(
        "/usr/bin/ss",
        ["-H", "-ltnp", `sport = :${port}`],
        `${unit} listener inventory`,
      ).stdout.trim();
      if (
        listener === "" ||
        listener.includes("\n") ||
        !listener.includes(`127.0.0.1:${port}`) ||
        !listener.includes(`pid=${mainPid},`)
      ) {
        fail(`${unit} does not exclusively own 127.0.0.1:${port}`);
      }
    }
  }
}

function validateContractSchema(contract) {
  exactKeys(
    contract,
    [
      "schemaVersion",
      "contractId",
      "productionRuntimeMode",
      "securityContours",
      "slots",
      "runtimeIdentity",
      "systemdTemplates",
      "transientPhases",
      "releaseBinding",
    ],
    "root",
  );
  exactValue(contract.schemaVersion, 1, "schemaVersion");
  exactValue(contract.contractId, "LEETPLUS_PRODUCTION_TOPOLOGY_V1", "contractId");
  exactValue(contract.productionRuntimeMode, "COMBINED", "productionRuntimeMode");

  exactKeys(
    contract.securityContours,
    ["independent", "releaseAccelerationMayNotCollapseContours"],
    "securityContours",
  );
  exactArray(
    contract.securityContours.independent,
    ["corporate-tenant", "public-guest", "workers-control-plane"],
    "securityContours.independent",
  );
  exactValue(
    contract.securityContours.releaseAccelerationMayNotCollapseContours,
    true,
    "securityContours.releaseAccelerationMayNotCollapseContours",
  );

  exactKeys(contract.slots, ["blue", "green", "nminus1"], "slots");
  for (const slot of ["blue", "green"]) {
    exactKeys(contract.slots[slot], ["apiPort", "apiUser", "webPort", "webUser"], `slots.${slot}`);
    positivePort(contract.slots[slot].apiPort, `slots.${slot}.apiPort`);
    positivePort(contract.slots[slot].webPort, `slots.${slot}.webPort`);
    exactValue(contract.slots[slot].apiUser, `leetplus-api-${slot}`, `slots.${slot}.apiUser`);
    exactValue(contract.slots[slot].webUser, `leetplus-web-${slot}`, `slots.${slot}.webUser`);
  }
  exactKeys(
    contract.slots.nminus1,
    ["apiChildPort", "apiPort", "apiUser", "webPort", "webUser"],
    "slots.nminus1",
  );
  for (const port of ["apiChildPort", "apiPort", "webPort"]) {
    positivePort(contract.slots.nminus1[port], `slots.nminus1.${port}`);
  }
  exactValue(contract.slots.nminus1.apiUser, "leetplus-api-nminus1", "slots.nminus1.apiUser");
  exactValue(contract.slots.nminus1.webUser, "leetplus-web-nminus1", "slots.nminus1.webUser");
  const ports = [
    contract.slots.blue.apiPort,
    contract.slots.blue.webPort,
    contract.slots.green.apiPort,
    contract.slots.green.webPort,
    contract.slots.nminus1.apiChildPort,
    contract.slots.nminus1.apiPort,
    contract.slots.nminus1.webPort,
  ];
  if (new Set(ports).size !== ports.length) fail("all listener ports must be unique");

  exactKeys(contract.runtimeIdentity, ["primaryGroup", "groups"], "runtimeIdentity");
  exactValue(contract.runtimeIdentity.primaryGroup, "leetplus-runtime", "runtimeIdentity.primaryGroup");
  exactKeys(
    contract.runtimeIdentity.groups,
    ["leetplus-api-runtime", "leetplus-runtime", "leetplus-web-runtime"],
    "runtimeIdentity.groups",
  );
  const apiUsers = [contract.slots.blue.apiUser, contract.slots.green.apiUser, contract.slots.nminus1.apiUser];
  const webUsers = [contract.slots.blue.webUser, contract.slots.green.webUser, contract.slots.nminus1.webUser];
  const sharedUsers = [...apiUsers, ...webUsers].sort();
  const groupExpectations = {
    "leetplus-api-runtime": { explicitMembers: apiUsers, primaryUsers: [] },
    "leetplus-runtime": { explicitMembers: [], primaryUsers: sharedUsers },
    "leetplus-web-runtime": { explicitMembers: webUsers, primaryUsers: [] },
  };
  for (const [groupName, expectation] of Object.entries(groupExpectations)) {
    const group = contract.runtimeIdentity.groups[groupName];
    exactKeys(group, ["explicitMembers", "primaryUsers"], `runtimeIdentity.groups.${groupName}`);
    exactArray(group.explicitMembers, expectation.explicitMembers, `${groupName}.explicitMembers`);
    exactArray(group.primaryUsers, expectation.primaryUsers, `${groupName}.primaryUsers`);
  }

  exactKeys(contract.systemdTemplates, ["api", "web"], "systemdTemplates");
  for (const kind of ["api", "web"]) {
    const template = contract.systemdTemplates[kind];
    exactKeys(
      template,
      ["environmentFiles", "path", "primaryGroup", "supplementaryGroup", "unit", "userPattern"],
      `systemdTemplates.${kind}`,
    );
    if (!Array.isArray(template.environmentFiles) || template.environmentFiles.length < 3) {
      fail(`systemdTemplates.${kind}.environmentFiles is incomplete`);
    }
    exactValue(template.primaryGroup, "leetplus-runtime", `systemdTemplates.${kind}.primaryGroup`);
    exactValue(template.supplementaryGroup, `leetplus-${kind}-runtime`, `systemdTemplates.${kind}.supplementaryGroup`);
    exactValue(template.unit, `leetplus-${kind}@.service`, `systemdTemplates.${kind}.unit`);
    exactValue(template.userPattern, `leetplus-${kind}-%i`, `systemdTemplates.${kind}.userPattern`);
  }

  exactKeys(contract.transientPhases, ["restoredCopyAcceptance"], "transientPhases");
  const rehearsal = contract.transientPhases.restoredCopyAcceptance;
  exactKeys(
    rehearsal,
    ["exactGroups", "mustFinishBefore", "primaryGroup", "serviceUser"],
    "transientPhases.restoredCopyAcceptance",
  );
  exactArray(rehearsal.exactGroups, ["leetplus-rehearsal", "leetplus-runtime"], "restoredCopyAcceptance.exactGroups");
  exactArray(
    rehearsal.mustFinishBefore,
    ["bind-release-slot", "blue-green-cutover"],
    "restoredCopyAcceptance.mustFinishBefore",
  );
  exactValue(rehearsal.primaryGroup, "leetplus-rehearsal", "restoredCopyAcceptance.primaryGroup");
  exactValue(rehearsal.serviceUser, "leetplus-rehearsal", "restoredCopyAcceptance.serviceUser");

  exactKeys(
    contract.releaseBinding,
    [
      "destinationSlots",
      "hydrationOriginSlots",
      "perDestinationSlotLinkReceiptRequired",
      "sameSealedReleaseMayBindToBoth",
    ],
    "releaseBinding",
  );
  exactArray(contract.releaseBinding.destinationSlots, ["blue", "green"], "releaseBinding.destinationSlots");
  exactArray(contract.releaseBinding.hydrationOriginSlots, ["blue", "green"], "releaseBinding.hydrationOriginSlots");
  exactValue(
    contract.releaseBinding.perDestinationSlotLinkReceiptRequired,
    true,
    "releaseBinding.perDestinationSlotLinkReceiptRequired",
  );
  exactValue(contract.releaseBinding.sameSealedReleaseMayBindToBoth, true, "releaseBinding.sameSealedReleaseMayBindToBoth");
}

function validateSourceBindings(root, contract) {
  for (const kind of ["api", "web"]) {
    const template = contract.systemdTemplates[kind];
    const unitText = readRepositoryFile(root, template.path);
    include(unitText, `User=${template.userPattern}\n`, `${kind} systemd User`);
    include(unitText, `Group=${template.primaryGroup}\n`, `${kind} systemd Group`);
    exactArray(unitEnvironmentFiles(unitText), template.environmentFiles, `${kind} systemd EnvironmentFile list`);
  }

  const cutoverPath = "docs/deployment/production-artifact/blue-green-cutover.sh";
  const cutover = readRepositoryFile(root, cutoverPath);
  include(
    cutover,
    `shared_primary\" == '${contract.runtimeIdentity.groups["leetplus-runtime"].primaryUsers.join(",")}'`,
    "blue-green shared primary users",
  );
  include(
    cutover,
    `expected_supplementary_members='${contract.runtimeIdentity.groups["leetplus-api-runtime"].explicitMembers.join(",")}'`,
    "blue-green API supplementary members",
  );
  include(
    cutover,
    `expected_supplementary_members='${contract.runtimeIdentity.groups["leetplus-web-runtime"].explicitMembers.join(",")}'`,
    "blue-green Web supplementary members",
  );
  include(cutover, "&& -z \"$runtime_group_members\"", "blue-green empty shared explicit membership");
  include(
    cutover,
    `if [[ \"$slot\" == blue ]]; then expected_listener_port=${contract.slots.blue.apiPort}; else expected_listener_port=${contract.slots.green.apiPort}; fi`,
    "blue-green API listener ports",
  );
  include(
    cutover,
    `if [[ \"$slot\" == blue ]]; then expected_listener_port=${contract.slots.blue.webPort}; else expected_listener_port=${contract.slots.green.webPort}; fi`,
    "blue-green Web listener ports",
  );
  for (const slot of ["blue", "green"]) {
    include(cutover, `http://127.0.0.1:${contract.slots[slot].apiPort}`, `blue-green ${slot} API URL`);
    include(cutover, `http://127.0.0.1:${contract.slots[slot].webPort}`, `blue-green ${slot} Web URL`);
  }
  include(cutover, `http://127.0.0.1:${contract.slots.nminus1.apiPort}`, "N-1 API edge URL");
  include(cutover, `http://127.0.0.1:${contract.slots.nminus1.webPort}`, "N-1 Web URL");

  const rehearsalPath = "docs/deployment/production-artifact/run-current-release-restored-copy-acceptance.sh";
  const rehearsal = readRepositoryFile(root, rehearsalPath);
  const rehearsalContract = contract.transientPhases.restoredCopyAcceptance;
  include(rehearsal, `readonly SERVICE_USER='${rehearsalContract.serviceUser}'`, "rehearsal service user");
  include(rehearsal, `readonly SERVICE_GROUP='${rehearsalContract.primaryGroup}'`, "rehearsal primary group");
  include(rehearsal, '"${#service_group_set[@]}" == 2', "rehearsal exact group count");
  include(rehearsal, "rehearsal service must belong only to its primary group and leetplus-runtime", "rehearsal group boundary");

  const bind = readRepositoryFile(root, "docs/deployment/production-artifact/bind-release-slot.sh");
  include(bind, "readonly SLOT_PATTERN='^(blue|green)$'", "slot-link destination set");
  include(bind, '[[ "$hydration_origin_slot" == blue || "$hydration_origin_slot" == green ]]', "hydration origin set");
  include(bind, 'receipt_path="${state_root}/${slot}-${operation_id}.bind.receipt"', "per-destination slot-link receipt");

  const cache = readRepositoryFile(root, "docs/deployment/production-artifact/prepare-web-slot-cache.sh");
  include(cache, "readonly SLOT_PATTERN='^(blue|green)$'", "Web cache destination set");

  const rollback = readRepositoryFile(root, "docs/deployment/production-artifact/legacy-rollback-auth-edge.mjs");
  include(rollback, `const PRODUCTION_CHILD_PORT = ${contract.slots.nminus1.apiChildPort};`, "N-1 child port");
}

function main() {
  const { root, contract: contractPath, liveNssPhase, liveSystemd } = parseArguments(process.argv.slice(2));
  const rawContract = readFile(contractPath, "contract");
  if (rawContract.includes("\r")) fail("contract must use LF line endings");
  let contract;
  try {
    contract = JSON.parse(rawContract);
  } catch (error) {
    fail(`contract is not valid JSON: ${error.message}`);
  }
  if (rawContract !== `${JSON.stringify(contract, null, 2)}\n`) {
    fail("contract JSON must be canonical two-space JSON with one trailing newline");
  }
  validateContractSchema(contract);
  validateSourceBindings(root, contract);
  if (liveNssPhase !== null) validateLiveNss(contract, liveNssPhase);
  if (liveSystemd) validateLiveSystemd(contract);
  process.stdout.write(`PRODUCTION_TOPOLOGY_CONTRACT=PASS contractId=${contract.contractId}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
