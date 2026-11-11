import {
  buildDashboardSetupProgress,
  type DashboardSetupFacts,
  TEMPORARY_FIRST_STORE_NAME,
} from './dashboard-setup-progress';

const fresh: DashboardSetupFacts = {
  activeLangameSources: 0,
  activeStores: [
    {
      name: TEMPORARY_FIRST_STORE_NAME,
      externalDomain: null,
      integrationSourceId: null,
    },
  ],
  staffAccounts: 0,
  openStaffInvites: 0,
  launchedMissions: 0,
  sentDailyReports: 0,
  hasSales: false,
  hasGameSessions: false,
};

describe('buildDashboardSetupProgress', () => {
  it('starts a new network with nothing done and no data', () => {
    const progress = buildDashboardSetupProgress(fresh);

    expect(progress.steps.map((step) => step.key)).toEqual([
      'langame',
      'clubs',
      'staff',
      'mission',
      'dailyReport',
    ]);
    expect(progress.completed).toBe(0);
    expect(progress.total).toBe(5);
    expect(progress.hasData).toBe(false);
  });

  it('counts clubs as checked only when every active club is renamed and linked', () => {
    const renamedOnly = buildDashboardSetupProgress({
      ...fresh,
      activeStores: [
        {
          name: 'Арена Север',
          externalDomain: null,
          integrationSourceId: null,
        },
      ],
    });
    const oneLeft = buildDashboardSetupProgress({
      ...fresh,
      activeStores: [
        {
          name: 'Арена Север',
          externalDomain: 'north',
          integrationSourceId: null,
        },
        {
          name: TEMPORARY_FIRST_STORE_NAME,
          externalDomain: 'main',
          integrationSourceId: null,
        },
      ],
    });
    const linked = buildDashboardSetupProgress({
      ...fresh,
      activeStores: [
        {
          name: 'Арена Север',
          externalDomain: null,
          integrationSourceId: 'src',
        },
      ],
    });
    const none = buildDashboardSetupProgress({ ...fresh, activeStores: [] });

    const clubs = (progress: typeof linked) =>
      progress.steps.find((step) => step.key === 'clubs')?.done;
    expect(clubs(renamedOnly)).toBe(false);
    expect(clubs(oneLeft)).toBe(false);
    expect(clubs(linked)).toBe(true);
    expect(clubs(none)).toBe(false);
  });

  it('marks every step done once the network is set up', () => {
    const progress = buildDashboardSetupProgress({
      activeLangameSources: 2,
      activeStores: [
        {
          name: 'Арена Север',
          externalDomain: 'north',
          integrationSourceId: 'a',
        },
      ],
      staffAccounts: 0,
      openStaffInvites: 1,
      launchedMissions: 1,
      sentDailyReports: 3,
      hasSales: false,
      hasGameSessions: true,
    });

    expect(progress.completed).toBe(5);
    expect(progress.steps.every((step) => step.done)).toBe(true);
    expect(progress.hasData).toBe(true);
  });
});
