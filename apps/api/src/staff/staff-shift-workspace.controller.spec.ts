import type { AuthenticatedUser } from '../auth/auth.types';
import { StaffShiftWorkspaceController } from './staff-shift-workspace.controller';

describe('StaffShiftWorkspaceController', () => {
  const user = {
    id: 'user-1',
    email: 'admin@example.test',
  } as AuthenticatedUser;
  const getCurrentMember = jest.fn();
  const getShiftWorkspaceOperator = jest.fn();
  const controller = new StaffShiftWorkspaceController(
    { getCurrentMember } as never,
    { getShiftWorkspaceOperator } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses only the current member binding to load the personal club shift', async () => {
    const staffMember = {
      id: 'member-1',
      store: { id: 'store-allowed' },
      externalDomain: 'club.example.test',
      externalUserId: 'operator-1',
    };
    const operator = {
      externalDomain: 'club.example.test',
      externalUserId: 'operator-1',
    };
    getCurrentMember.mockResolvedValue({ staffMember });
    getShiftWorkspaceOperator.mockResolvedValue(operator);

    await expect(
      controller.getProfile(user, {
        dateFrom: '2026-08-24',
        dateTo: '2026-08-24',
        storeId: 'store-forbidden',
        search: 'another-operator',
      } as never),
    ).resolves.toEqual({ staffMember, operator });

    expect(getShiftWorkspaceOperator).toHaveBeenCalledWith(user, {
      dateFrom: '2026-08-24',
      dateTo: '2026-08-24',
      storeId: 'store-allowed',
      externalDomain: 'club.example.test',
      externalUserId: 'operator-1',
    });
  });

  it('does not query shift analytics without a Langame staff binding', async () => {
    const staffMember = {
      id: 'member-1',
      store: { id: 'store-allowed' },
      externalDomain: null,
      externalUserId: null,
    };
    getCurrentMember.mockResolvedValue({ staffMember });

    await expect(controller.getProfile(user, {})).resolves.toEqual({
      staffMember,
      operator: null,
    });
    expect(getShiftWorkspaceOperator).not.toHaveBeenCalled();
  });
});
