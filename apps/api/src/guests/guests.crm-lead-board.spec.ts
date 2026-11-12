import { BadRequestException } from '@nestjs/common';
import {
  GuestCommunicationConsentStatus,
  GuestCrmLeadStage,
  GuestCrmStatus,
} from '@prisma/client';
import { GuestsService } from './guests.service';

const user = { id: 'user-1', tenantId: 'tenant-1' } as never;

function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    fullNameMasked: 'Ив***',
    fullNameEncrypted: null,
    phoneMasked: '+7 *** ***-12-45',
    phoneEncrypted: null,
    emailMasked: null,
    source: null,
    eventName: 'Бронь на 5 мест',
    crmStatus: GuestCrmStatus.CONTACT,
    crmNote: null,
    nextAction: null,
    nextContactAt: null,
    phoneConsentStatus: GuestCommunicationConsentStatus.GRANTED,
    phoneConsentSource: 'звонок',
    phoneConsentAt: new Date('2026-11-01T10:00:00Z'),
    unsubscribedAt: null,
    matchedGuestId: null,
    matchedAt: null,
    stage: GuestCrmLeadStage.IN_PROGRESS,
    stageChangedAt: new Date('2026-11-12T10:00:00Z'),
    visitAt: null,
    createdAt: new Date('2026-11-01T10:00:00Z'),
    updatedAt: new Date('2026-11-12T10:00:00Z'),
    matchedGuest: null,
    assignedToUser: { id: 'user-2', fullName: 'Анна', email: 'a@example.test' },
    ...overrides,
  };
}

describe('GuestsService CRM lead board fields', () => {
  const leadFindFirst = jest.fn();
  const leadUpdate = jest.fn<
    Promise<unknown>,
    [{ where: { id: string }; data: Record<string, unknown> }]
  >();
  const resolveTenant = jest.fn<Promise<{ tenantId: string }>, []>();
  const userFindFirst = jest.fn();
  const transaction = jest.fn();
  let service: GuestsService;

  beforeEach(() => {
    jest.clearAllMocks();
    leadFindFirst
      .mockResolvedValueOnce({
        id: 'lead-1',
        matchedGuestId: null,
        stage: GuestCrmLeadStage.NEW,
      })
      .mockResolvedValueOnce(leadRow());
    leadUpdate.mockResolvedValue({});
    userFindFirst.mockResolvedValue({ id: 'user-2' });
    resolveTenant.mockResolvedValue({ tenantId: 'tenant-1' });

    service = new GuestsService(
      {
        guestCrmLead: { findFirst: leadFindFirst, update: leadUpdate },
        user: { findFirst: userFindFirst },
        $transaction: transaction,
      } as never,
      { resolve: resolveTenant } as never,
      null as never,
      null as never,
      null as never,
      null as never,
    );
  });

  it('moves a lead to another stage without touching consent', async () => {
    const lead = await service.updateGuestCrmLead(user, 'lead-1', {
      stage: GuestCrmLeadStage.IN_PROGRESS,
      assignedToUserId: 'user-2',
    });

    expect(leadUpdate).toHaveBeenCalledTimes(1);
    const { data } = leadUpdate.mock.calls[0][0];
    expect(data.stage).toBe(GuestCrmLeadStage.IN_PROGRESS);
    expect(data.stageChangedAt).toBeInstanceOf(Date);
    expect(data.assignedToUserId).toBe('user-2');
    expect(data).not.toHaveProperty('phoneConsentStatus');
    expect(transaction).not.toHaveBeenCalled();
    expect(userFindFirst).toHaveBeenCalledWith({
      where: { id: 'user-2', tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(lead.stage).toBe(GuestCrmLeadStage.IN_PROGRESS);
    expect(lead.assignedToUser).toEqual({
      id: 'user-2',
      displayName: 'Анна',
      email: 'a@example.test',
    });
    expect(lead.phoneConsentStatus).toBe(
      GuestCommunicationConsentStatus.GRANTED,
    );
  });

  it('keeps stageChangedAt when the stage does not change', async () => {
    await service.updateGuestCrmLead(user, 'lead-1', {
      stage: GuestCrmLeadStage.NEW,
      eventName: '  День рождения  ',
    });

    const { data } = leadUpdate.mock.calls[0][0];
    expect(data).toEqual({ eventName: 'День рождения' });
  });

  it('rejects an unknown stage before writing anything', async () => {
    await expect(
      service.updateGuestCrmLead(user, 'lead-1', { stage: 'WON' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(leadUpdate).not.toHaveBeenCalled();
  });
});
