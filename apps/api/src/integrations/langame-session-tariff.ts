import type { LangameTariffTypeGroup } from './langame.types';

export type LangameSessionBillingKind =
  | 'hourly'
  | 'package_or_subscription'
  | 'unknown';

export type LangameTariffTypeGroupIndex = ReadonlyMap<
  string,
  LangameTariffTypeGroup
>;

export type LangameSessionTariffResolution = {
  kind: LangameSessionBillingKind;
  tariffGroupId: string | null;
  tariffType: string | null;
  tariffName: string | null;
};

export function buildLangameTariffTypeGroupIndex(
  rows: LangameTariffTypeGroup[],
): LangameTariffTypeGroupIndex {
  const index = new Map<string, LangameTariffTypeGroup>();

  for (const row of rows) {
    const id = primitiveString(row.id)?.trim();

    if (id) {
      index.set(id, row);
    }
  }

  return index;
}

export function resolveLangameSessionTariff(
  packetMarker: unknown,
  tariffTypeGroups: LangameTariffTypeGroupIndex,
): LangameSessionTariffResolution {
  if (typeof packetMarker === 'boolean') {
    return resolution(packetMarker ? 'package_or_subscription' : 'hourly');
  }

  const marker = primitiveString(packetMarker)?.trim() ?? null;

  if (!marker) {
    return resolution('unknown');
  }

  const normalizedMarker = marker.toLowerCase();

  if (['false', 'no', 'n', 'нет'].includes(normalizedMarker)) {
    return resolution('hourly');
  }

  if (['true', 'yes', 'y', 'да'].includes(normalizedMarker)) {
    return resolution('package_or_subscription');
  }

  const group = tariffTypeGroups.get(marker);

  if (group) {
    return {
      kind: classifyTariffTypeGroup(group),
      tariffGroupId: marker,
      tariffType: nullableString(group.type),
      tariffName: nullableString(group.name),
    };
  }

  // Older Langame installations exposed packet as a boolean 0/1 flag. A
  // positive numeric value without the tariff dictionary is now ambiguous:
  // current installations use it as a tariff-group ID.
  if (normalizedMarker === '0') {
    return resolution('hourly', marker);
  }

  return resolution('unknown', marker);
}

function classifyTariffTypeGroup(
  group: LangameTariffTypeGroup,
): LangameSessionBillingKind {
  const type = normalize(group.type);

  if (['basic', 'hourly', 'payg', 'time'].includes(type)) {
    return 'hourly';
  }

  if (['packet', 'package', 'subscription', 'membership'].includes(type)) {
    return 'package_or_subscription';
  }

  const description = normalize([group.name, group.comment].filter(Boolean).join(' '));

  if (/почас|hourly|pay\s*as\s*you\s*go/.test(description)) {
    return 'hourly';
  }

  if (/пакет|абонемент|subscription|membership|package|packet/.test(description)) {
    return 'package_or_subscription';
  }

  return 'unknown';
}

function resolution(
  kind: LangameSessionBillingKind,
  tariffGroupId: string | null = null,
): LangameSessionTariffResolution {
  return {
    kind,
    tariffGroupId,
    tariffType: null,
    tariffName: null,
  };
}

function normalize(value: unknown) {
  return primitiveString(value)?.trim().toLowerCase() ?? '';
}

function nullableString(value: unknown) {
  const normalized = primitiveString(value)?.trim();
  return normalized || null;
}

function primitiveString(value: unknown) {
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    default:
      return null;
  }
}
