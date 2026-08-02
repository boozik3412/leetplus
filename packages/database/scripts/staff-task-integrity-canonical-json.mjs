function canonicalJsonError() {
  const error = new Error(
    "Canonical JSON input contains an unsupported value.",
  );
  error.code = "DIGEST_INPUT_INVALID";
  error.safeContractError = true;
  throw error;
}

export function canonicalStringify(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      canonicalJsonError();
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  canonicalJsonError();
}
