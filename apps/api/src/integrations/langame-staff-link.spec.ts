import { Prisma } from '@prisma/client';
import {
  autoLinkStaffMembersToLangame,
  normalizeStaffLinkEmail,
  normalizeStaffLinkName,
  normalizeStaffLinkPhone,
  planStaffLangameAutoLinks,
  staffLangameIdentityKey,
} from './langame-staff-link';

const admin = (
  externalUserId: string,
  fields: {
    email?: string;
    phone?: string;
    domain?: string;
    name?: string;
  } = {},
) => ({
  externalDomain: fields.domain ?? '46.langamepro.ru',
  externalUserId,
  username: fields.name ?? null,
  email: fields.email ?? null,
  phone: fields.phone ?? null,
});

const member = (
  id: string,
  fields: {
    email?: string;
    phone?: string;
    storeDomain?: string;
    name?: string;
  } = {},
) => ({
  id,
  displayName: fields.name ?? null,
  email: fields.email ?? null,
  phone: fields.phone ?? null,
  storeDomain: fields.storeDomain ?? null,
});

describe('planStaffLangameAutoLinks', () => {
  it('links a card to the single admin with the same email, ignoring case', () => {
    expect(
      planStaffLangameAutoLinks(
        [member('m1', { email: ' Ivan@Club.ru ' })],
        [admin('12', { email: 'ivan@club.ru' }), admin('13')],
        new Set(),
      ),
    ).toEqual([
      {
        memberId: 'm1',
        externalDomain: '46.langamepro.ru',
        externalUserId: '12',
        source: 'AUTO_EMAIL',
      },
    ]);
  });

  it('matches phones across 7/8/+7 forms and marks the link AUTO_PHONE', () => {
    expect(
      planStaffLangameAutoLinks(
        [member('m1', { phone: '8 (912) 345-67-89' })],
        [admin('12', { phone: '+79123456789' })],
        new Set(),
      ),
    ).toEqual([expect.objectContaining({ source: 'AUTO_PHONE' })]);
  });

  it('skips a card that matches two admins (shared club email)', () => {
    expect(
      planStaffLangameAutoLinks(
        [member('m1', { email: 'club@club.ru' })],
        [
          admin('12', { email: 'club@club.ru' }),
          admin('13', { email: 'club@club.ru' }),
        ],
        new Set(),
      ),
    ).toEqual([]);
  });

  it('skips when email and phone point to different admins', () => {
    expect(
      planStaffLangameAutoLinks(
        [member('m1', { email: 'a@club.ru', phone: '79123456789' })],
        [
          admin('12', { email: 'a@club.ru' }),
          admin('13', { phone: '89123456789' }),
        ],
        new Set(),
      ),
    ).toEqual([]);
  });

  it('skips an admin that matches two cards', () => {
    expect(
      planStaffLangameAutoLinks(
        [
          member('m1', { phone: '79123456789' }),
          member('m2', { phone: '89123456789' }),
        ],
        [admin('12', { phone: '79123456789' })],
        new Set(),
      ),
    ).toEqual([]);
  });

  it('does not offer an admin already linked to another card', () => {
    expect(
      planStaffLangameAutoLinks(
        [member('m1', { email: 'a@club.ru' })],
        [admin('12', { email: 'a@club.ru' })],
        new Set([staffLangameIdentityKey('46.langamepro.ru', '12')]),
      ),
    ).toEqual([]);
  });

  it('looks only at the domain of the card club', () => {
    const admins = [
      admin('12', { email: 'a@club.ru', domain: '1337.langame.ru' }),
      admin('12', { email: 'a@club.ru', domain: '443.langame.ru' }),
    ];
    expect(
      planStaffLangameAutoLinks(
        [member('m1', { email: 'a@club.ru', storeDomain: '443.langame.ru' })],
        admins,
        new Set(),
      ),
    ).toEqual([
      expect.objectContaining({
        externalDomain: '443.langame.ru',
        externalUserId: '12',
      }),
    ]);
    // A network card sees both domains, so the same email is ambiguous.
    expect(
      planStaffLangameAutoLinks(
        [member('m1', { email: 'a@club.ru' })],
        admins,
        new Set(),
      ),
    ).toEqual([]);
  });

  it('links by full name inside the club domain, ё = е, patronymic optional', () => {
    const admins = [
      admin('364', { name: 'Семенова Анастасия Анатольевна' }),
      admin('91', {
        name: 'Вяткин Владислав Олегович',
        domain: '1337.langame.ru',
      }),
      admin('88', {
        name: 'Вяткин Владислав Олегович',
        domain: '443.langame.ru',
      }),
    ];
    expect(
      planStaffLangameAutoLinks(
        [
          member('m1', {
            name: 'Семёнова  Анастасия Анатольевна',
            storeDomain: '46.langamepro.ru',
          }),
          member('m2', {
            name: 'Вяткин Владислав',
            storeDomain: '1337.langame.ru',
          }),
        ],
        admins,
        new Set(),
      ),
    ).toEqual([
      expect.objectContaining({
        memberId: 'm1',
        externalUserId: '364',
        source: 'AUTO_NAME',
      }),
      expect.objectContaining({
        memberId: 'm2',
        externalDomain: '1337.langame.ru',
        externalUserId: '91',
        source: 'AUTO_NAME',
      }),
    ]);
  });

  it('does not link by name across domains, on a different patronymic or a namesake', () => {
    expect(
      planStaffLangameAutoLinks(
        [member('m1', { name: 'Петухов Данил Денисович' })],
        [admin('88', { name: 'Петухов Данил Денисович' })],
        new Set(),
      ),
    ).toEqual([]);
    expect(
      planStaffLangameAutoLinks(
        [
          member('m1', {
            name: 'Тюрин Данил Антонович',
            storeDomain: '46.langamepro.ru',
          }),
        ],
        [admin('305', { name: 'Тюрин Данил Анатольевич' })],
        new Set(),
      ),
    ).toEqual([]);
    expect(
      planStaffLangameAutoLinks(
        [
          member('m1', {
            name: 'Иванов Иван',
            storeDomain: '46.langamepro.ru',
          }),
        ],
        [
          admin('1', { name: 'Иванов Иван Петрович' }),
          admin('2', { name: 'Иванов Иван Сергеевич' }),
        ],
        new Set(),
      ),
    ).toEqual([]);
  });

  it('prefers email over name and skips when they point to different admins', () => {
    expect(
      planStaffLangameAutoLinks(
        [
          member('m1', {
            name: 'Иванов Иван',
            email: 'a@club.ru',
            storeDomain: '46.langamepro.ru',
          }),
        ],
        [admin('1', { name: 'Иванов Иван', email: 'a@club.ru' })],
        new Set(),
      ),
    ).toEqual([expect.objectContaining({ source: 'AUTO_EMAIL' })]);
    expect(
      planStaffLangameAutoLinks(
        [
          member('m1', {
            name: 'Иванов Иван',
            email: 'a@club.ru',
            storeDomain: '46.langamepro.ru',
          }),
        ],
        [
          admin('1', { email: 'a@club.ru' }),
          admin('2', { name: 'Иванов Иван' }),
        ],
        new Set(),
      ),
    ).toEqual([]);
  });

  it('needs at least surname and first name', () => {
    expect(normalizeStaffLinkName('acc')).toBeNull();
    expect(normalizeStaffLinkName('Ёлкин Пётр')).toEqual(['елкин', 'петр']);
  });

  it('ignores short phones and malformed emails', () => {
    expect(normalizeStaffLinkPhone('12345')).toBeNull();
    expect(normalizeStaffLinkEmail('not-an-email')).toBeNull();
    expect(
      planStaffLangameAutoLinks(
        [member('m1', { phone: '12345', email: 'x' })],
        [admin('12', { phone: '12345', email: 'x' })],
        new Set(),
      ),
    ).toEqual([]);
  });
});

function firstCallWhere(mock: jest.Mock) {
  const [[args]] = mock.mock.calls as [[{ where: unknown }]];
  return args.where;
}

describe('autoLinkStaffMembersToLangame', () => {
  const now = new Date('2026-11-13T05:00:00.000Z');

  function prismaMock() {
    return {
      staffMember: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      langameStaffUser: { findMany: jest.fn() },
    };
  }

  it('reads only undecided active cards and present admins, then writes with CAS', async () => {
    const prisma = prismaMock();
    prisma.staffMember.findMany
      .mockResolvedValueOnce([
        {
          id: 'm1',
          displayName: 'Иванов Иван',
          email: 'a@club.ru',
          phone: null,
          store: { externalDomain: '46.langamepro.ru' },
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.langameStaffUser.findMany.mockResolvedValue([
      admin('12', { email: 'a@club.ru' }),
    ]);

    await expect(
      autoLinkStaffMembersToLangame(prisma as never, 'tenant-1', { now }),
    ).resolves.toEqual({ linked: 1 });

    expect(firstCallWhere(prisma.staffMember.findMany)).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-1',
        externalDomain: null,
        externalUserId: null,
        externalLinkSource: null,
        status: { notIn: ['DISMISSED', 'ARCHIVED'] },
      }),
    );
    expect(firstCallWhere(prisma.langameStaffUser.findMany)).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-1',
        missingFromSourceAt: null,
      }),
    );
    expect(prisma.staffMember.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'm1',
        tenantId: 'tenant-1',
        externalDomain: null,
        externalUserId: null,
        externalLinkSource: null,
      },
      data: {
        externalProvider: 'LANGAME',
        externalDomain: '46.langamepro.ru',
        externalUserId: '12',
        externalLinkSource: 'AUTO_EMAIL',
        externalLinkedAt: now,
      },
    });
  });

  it('does not query admins when no card is waiting for a link', async () => {
    const prisma = prismaMock();
    prisma.staffMember.findMany.mockResolvedValueOnce([]);

    await expect(
      autoLinkStaffMembersToLangame(prisma as never, 'tenant-1'),
    ).resolves.toEqual({ linked: 0 });
    expect(prisma.langameStaffUser.findMany).not.toHaveBeenCalled();
  });

  it('skips a card that lost a unique race instead of failing the sync', async () => {
    const prisma = prismaMock();
    prisma.staffMember.findMany
      .mockResolvedValueOnce([
        {
          id: 'm1',
          displayName: 'Иванов Иван',
          email: 'a@club.ru',
          phone: null,
          store: null,
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.langameStaffUser.findMany.mockResolvedValue([
      admin('12', { email: 'a@club.ru' }),
    ]);
    prisma.staffMember.updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      autoLinkStaffMembersToLangame(prisma as never, 'tenant-1'),
    ).resolves.toEqual({ linked: 0 });
  });
});
