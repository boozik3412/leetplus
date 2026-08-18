import { BadRequestException } from '@nestjs/common';

const MAX_REFERENCE_NODES = 20_000;
const MAX_REFERENCE_DEPTH = 64;
const MAX_REFERENCE_COUNT = 1_000;
const MAX_REFERENCE_STRING_LENGTH = 2_000_000;
const ROUTE_MARKER_RE = /\/(?:api\/)?staff\/attachments\//gi;
const EXACT_ATTACHMENT_URL_RE =
  /^\/(?:api\/)?staff\/attachments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_AT_START_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=$|[\s"')\],}<])/i;

type PendingNode = {
  depth: number;
  value: unknown;
};

export function isExactStaffAttachmentUrl(value: string) {
  return EXACT_ATTACHMENT_URL_RE.test(value);
}

export function extractStaffAttachmentIds(values: readonly unknown[]) {
  const ids = new Set<string>();
  const stack: PendingNode[] = values.map((value) => ({ depth: 0, value }));
  const seen = new WeakSet<object>();
  let visitedNodes = 0;

  while (stack.length > 0) {
    const current = stack.pop()!;
    visitedNodes += 1;

    if (
      visitedNodes > MAX_REFERENCE_NODES ||
      current.depth > MAX_REFERENCE_DEPTH
    ) {
      invalidReferences();
    }

    if (typeof current.value === 'string') {
      collectStringReferences(current.value, ids);
      continue;
    }

    if (current.value === null || current.value === undefined) {
      continue;
    }

    if (
      typeof current.value === 'number' ||
      typeof current.value === 'boolean'
    ) {
      continue;
    }

    if (typeof current.value !== 'object') {
      invalidReferences();
    }

    const objectValue = current.value;
    if (seen.has(objectValue)) {
      invalidReferences();
    }
    seen.add(objectValue);

    if (Array.isArray(objectValue)) {
      for (let index = objectValue.length - 1; index >= 0; index -= 1) {
        stack.push({ depth: current.depth + 1, value: objectValue[index] });
      }
      continue;
    }

    const prototype: unknown = Object.getPrototypeOf(objectValue);
    if (prototype !== Object.prototype && prototype !== null) {
      invalidReferences();
    }

    const descriptors = Object.getOwnPropertyDescriptors(objectValue);
    if (Object.getOwnPropertySymbols(objectValue).length > 0) {
      invalidReferences();
    }

    for (const descriptor of Object.values(descriptors).reverse()) {
      if (!('value' in descriptor)) {
        invalidReferences();
      }
      stack.push({ depth: current.depth + 1, value: descriptor.value });
    }
  }

  return Array.from(ids).sort();
}

function collectStringReferences(value: string, ids: Set<string>) {
  if (value.length > MAX_REFERENCE_STRING_LENGTH) {
    invalidReferences();
  }

  ROUTE_MARKER_RE.lastIndex = 0;
  let marker: RegExpExecArray | null;

  while ((marker = ROUTE_MARKER_RE.exec(value)) !== null) {
    const tokenPrefix = value
      .slice(0, marker.index)
      .split(/[\s"'<>()[\]{},;]/)
      .at(-1);
    if (tokenPrefix?.includes('://')) {
      invalidReferences();
    }
    const suffix = value.slice(ROUTE_MARKER_RE.lastIndex);
    const uuid = UUID_AT_START_RE.exec(suffix)?.[1];

    if (!uuid) {
      invalidReferences();
    }

    ids.add(uuid.toLowerCase());
    if (ids.size > MAX_REFERENCE_COUNT) {
      invalidReferences();
    }
  }
}

function invalidReferences(): never {
  throw new BadRequestException('Invalid attachment references');
}
