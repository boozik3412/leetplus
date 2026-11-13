import { IntegrationProvider, Prisma } from '@prisma/client';

/**
 * Link between a LeetPlus staff card (StaffMember) and a Langame admin
 * account (LangameStaffUser): StaffMember.externalDomain + externalUserId.
 *
 * - MANUAL: set or cleared by a person in the staff card. Never touched by
 *   the automatic pass, including an explicit «no link».
 * - AUTO_EMAIL / AUTO_PHONE / AUTO_NAME: LeetPlus found exactly one Langame
 *   admin with the same email, phone or full name (surname + first name, and
 *   patronymic when either side has it) and that admin matched no other card.
 *   Langame admins carry no email today and few phones, so the full name does
 *   most of the work; it is only trusted inside the domain of the card club.
 * - null: links made before 13.11.2026, or no link and no decision yet.
 */
export const STAFF_LANGAME_LINK_SOURCES = [
  'MANUAL',
  'AUTO_EMAIL',
  'AUTO_PHONE',
  'AUTO_NAME',
] as const;

export type StaffLangameLinkSource =
  (typeof STAFF_LANGAME_LINK_SOURCES)[number];

export type StaffLangameLinkMember = {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  /** Langame domain of the member's club; null = any domain of the tenant. */
  storeDomain: string | null;
};

export type StaffLangameLinkAdmin = {
  externalDomain: string;
  externalUserId: string;
  username: string | null;
  email: string | null;
  phone: string | null;
};

export type StaffLangameLinkPlanItem = {
  memberId: string;
  externalDomain: string;
  externalUserId: string;
  source: Exclude<StaffLangameLinkSource, 'MANUAL'>;
};

const INACTIVE_MEMBER_STATUSES = ['DISMISSED', 'ARCHIVED'];
const MAX_MEMBERS = 1000;
const MAX_ADMINS = 5000;

export function normalizeStaffLinkEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email : null;
}

/** Last ten digits of a phone with at least ten digits (RU 7/8 prefixes). */
export function normalizeStaffLinkPhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/gu, '') ?? '';
  return digits.length >= 10 && digits.length <= 15 ? digits.slice(-10) : null;
}

/**
 * Full name as comparable tokens: lower case, ё → е, letters only. At least
 * surname and first name are required, so logins like «acc» never match.
 */
export function normalizeStaffLinkName(value: string | null | undefined) {
  const tokens =
    value
      ?.toLowerCase()
      .replace(/ё/gu, 'е')
      .split(/[^\p{L}]+/u)
      .filter(Boolean) ?? [];
  return tokens.length >= 2 && tokens.length <= 4 ? tokens : null;
}

/**
 * Same person by name: equal surname and first name; a patronymic counts
 * only when both sides have one (it must then be equal too).
 */
function sameStaffLinkName(left: string[], right: string[]) {
  if (
    left.length !== right.length &&
    Math.min(left.length, right.length) !== 2
  ) {
    return false;
  }
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function staffLangameIdentityKey(domain: string, userId: string) {
  return `${domain}\u0000${userId}`;
}

/**
 * Pure matching. A pair is linked only when it is unambiguous both ways:
 * the card matches exactly one free Langame admin, and that admin matches
 * exactly one card. Admins already linked to a card are not offered again.
 */
export function planStaffLangameAutoLinks(
  members: StaffLangameLinkMember[],
  admins: StaffLangameLinkAdmin[],
  linkedAdminKeys: ReadonlySet<string>,
): StaffLangameLinkPlanItem[] {
  const freeAdmins = admins
    .filter(
      (admin) =>
        !linkedAdminKeys.has(
          staffLangameIdentityKey(admin.externalDomain, admin.externalUserId),
        ),
    )
    .map((admin) => ({
      admin,
      key: staffLangameIdentityKey(admin.externalDomain, admin.externalUserId),
      email: normalizeStaffLinkEmail(admin.email),
      phone: normalizeStaffLinkPhone(admin.phone),
      name: normalizeStaffLinkName(admin.username),
    }))
    .filter((admin) => admin.email || admin.phone || admin.name);

  const matchesByMember = new Map<
    string,
    Array<{
      key: string;
      admin: StaffLangameLinkAdmin;
      byEmail: boolean;
      byPhone: boolean;
    }>
  >();
  const membersByAdminKey = new Map<string, Set<string>>();

  for (const member of members) {
    const email = normalizeStaffLinkEmail(member.email);
    const phone = normalizeStaffLinkPhone(member.phone);
    // A name is trusted only inside one club domain: a network card (no
    // club) is matched by email or phone alone.
    const name = member.storeDomain
      ? normalizeStaffLinkName(member.displayName)
      : null;
    if (!email && !phone && !name) continue;

    const matches = freeAdmins
      .filter(
        (admin) =>
          !member.storeDomain ||
          admin.admin.externalDomain === member.storeDomain,
      )
      .map((admin) => ({
        key: admin.key,
        admin: admin.admin,
        byEmail: Boolean(email && admin.email === email),
        byPhone: Boolean(phone && admin.phone === phone),
        byName: Boolean(
          name && admin.name && sameStaffLinkName(name, admin.name),
        ),
      }))
      .filter((match) => match.byEmail || match.byPhone || match.byName);

    matchesByMember.set(member.id, matches);
    for (const match of matches) {
      const owners = membersByAdminKey.get(match.key) ?? new Set<string>();
      owners.add(member.id);
      membersByAdminKey.set(match.key, owners);
    }
  }

  const plan: StaffLangameLinkPlanItem[] = [];
  for (const member of members) {
    const matches = matchesByMember.get(member.id) ?? [];
    if (matches.length !== 1) continue;
    const [match] = matches;
    if (membersByAdminKey.get(match.key)?.size !== 1) continue;
    plan.push({
      memberId: member.id,
      externalDomain: match.admin.externalDomain,
      externalUserId: match.admin.externalUserId,
      source: match.byEmail
        ? 'AUTO_EMAIL'
        : match.byPhone
          ? 'AUTO_PHONE'
          : 'AUTO_NAME',
    });
  }

  return plan;
}

type StaffLinkPrisma = {
  staffMember: Pick<Prisma.StaffMemberDelegate, 'findMany' | 'updateMany'>;
  langameStaffUser: Pick<Prisma.LangameStaffUserDelegate, 'findMany'>;
};

/**
 * Links cards without a Langame identity and without a manual decision to
 * the Langame admin with the same email, phone or full name (see
 * planStaffLangameAutoLinks). Never overwrites or
 * clears a link; a concurrent edit or a unique collision skips the card.
 */
export async function autoLinkStaffMembersToLangame(
  prisma: StaffLinkPrisma,
  tenantId: string,
  options: { memberIds?: string[]; now?: Date } = {},
): Promise<{ linked: number }> {
  const members = await prisma.staffMember.findMany({
    where: {
      tenantId,
      ...(options.memberIds ? { id: { in: options.memberIds } } : {}),
      externalDomain: null,
      externalUserId: null,
      externalLinkSource: null,
      status: { notIn: INACTIVE_MEMBER_STATUSES },
    },
    select: {
      id: true,
      displayName: true,
      email: true,
      phone: true,
      store: { select: { externalDomain: true } },
    },
    take: MAX_MEMBERS,
  });

  if (members.length === 0) {
    return { linked: 0 };
  }

  const [admins, linkedMembers] = await Promise.all([
    prisma.langameStaffUser.findMany({
      where: {
        tenantId,
        externalProvider: IntegrationProvider.LANGAME,
        missingFromSourceAt: null,
      },
      select: {
        externalDomain: true,
        externalUserId: true,
        username: true,
        email: true,
        phone: true,
      },
      take: MAX_ADMINS,
    }),
    prisma.staffMember.findMany({
      where: {
        tenantId,
        externalDomain: { not: null },
        externalUserId: { not: null },
      },
      select: { externalDomain: true, externalUserId: true },
    }),
  ]);

  const linkedKeys = new Set(
    linkedMembers.map((member) =>
      staffLangameIdentityKey(
        member.externalDomain ?? '',
        member.externalUserId ?? '',
      ),
    ),
  );
  const plan = planStaffLangameAutoLinks(
    members.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      email: member.email,
      phone: member.phone,
      storeDomain: member.store?.externalDomain ?? null,
    })),
    admins,
    linkedKeys,
  );

  const now = options.now ?? new Date();
  let linked = 0;
  for (const item of plan) {
    try {
      const result = await prisma.staffMember.updateMany({
        where: {
          id: item.memberId,
          tenantId,
          externalDomain: null,
          externalUserId: null,
          externalLinkSource: null,
        },
        data: {
          externalProvider: IntegrationProvider.LANGAME,
          externalDomain: item.externalDomain,
          externalUserId: item.externalUserId,
          externalLinkSource: item.source,
          externalLinkedAt: now,
        },
      });
      linked += result.count;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        continue;
      }
      throw error;
    }
  }

  return { linked };
}
