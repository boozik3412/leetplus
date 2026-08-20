import { constants as fsConstants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { resolve } from "node:path";

const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const MAX_BUILD_ID_BYTES = 128;

type WebReleaseEnvironment = Readonly<{
  RELEASE_SHA?: string;
  WEB_BUILD_ID?: string;
}>;

export type WebReleaseIdentity = Readonly<{
  sha: string;
  webBuildId: string;
}>;

function requiredReleaseSha(value: string | undefined, name: string) {
  if (!value || !RELEASE_SHA_PATTERN.test(value)) {
    throw new Error(`${name} must be an exact lowercase 40-character Git SHA`);
  }

  return value;
}

function parseBuildIdRecord(contents: Buffer) {
  let value = contents.toString("utf8");

  if (value.endsWith("\r\n")) {
    value = value.slice(0, -2);
  } else if (value.endsWith("\n")) {
    value = value.slice(0, -1);
  }

  if (!RELEASE_SHA_PATTERN.test(value)) {
    throw new Error("The runtime Web BUILD_ID record is invalid");
  }

  return value;
}

async function readBoundedRegularBuildId(webWorkingDirectory: string) {
  const buildIdPath = resolve(webWorkingDirectory, ".next", "BUILD_ID");
  const pathMetadata = await lstat(buildIdPath);

  if (
    !pathMetadata.isFile() ||
    pathMetadata.size < 40 ||
    pathMetadata.size > MAX_BUILD_ID_BYTES
  ) {
    throw new Error("The runtime Web BUILD_ID is not a bounded regular file");
  }

  // O_NOFOLLOW closes the lstat/open race on the Linux production runtime.
  // The pre-open lstat and post-open identity checks retain the same contract
  // on development platforms where Node does not expose O_NOFOLLOW.
  const noFollow = process.platform === "linux" ? fsConstants.O_NOFOLLOW : 0;
  const handle = await open(buildIdPath, fsConstants.O_RDONLY | noFollow);

  try {
    const openedMetadata = await handle.stat();
    if (
      !openedMetadata.isFile() ||
      openedMetadata.size !== pathMetadata.size ||
      openedMetadata.dev !== pathMetadata.dev ||
      openedMetadata.ino !== pathMetadata.ino
    ) {
      throw new Error("The runtime Web BUILD_ID changed while opening");
    }

    const buffer = Buffer.alloc(MAX_BUILD_ID_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0);

    if (bytesRead !== openedMetadata.size || bytesRead > MAX_BUILD_ID_BYTES) {
      throw new Error("The runtime Web BUILD_ID changed while reading");
    }

    return parseBuildIdRecord(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

/**
 * Resolves the running Web process identity. Filesystem access happens only
 * when this function is called by the runtime route; importing the module does
 * not touch `.next/BUILD_ID` and therefore cannot interfere with `next build`.
 */
export async function resolveWebReleaseIdentity(
  environment: WebReleaseEnvironment,
  webWorkingDirectory: string,
): Promise<WebReleaseIdentity> {
  const sha = requiredReleaseSha(environment.RELEASE_SHA, "RELEASE_SHA");
  const webBuildId = requiredReleaseSha(
    environment.WEB_BUILD_ID,
    "WEB_BUILD_ID",
  );

  if (sha !== webBuildId) {
    throw new Error(
      "RELEASE_SHA and WEB_BUILD_ID must identify the same release",
    );
  }

  const actualBuildId = await readBoundedRegularBuildId(webWorkingDirectory);
  if (actualBuildId !== sha) {
    throw new Error("The running Web BUILD_ID does not match the release SHA");
  }

  return { sha, webBuildId };
}
