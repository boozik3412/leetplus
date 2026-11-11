// The owner's launch checklist on /dashboard (UX plan, step 2.6). Every step
// is read from data the network already has; nothing here is stored.

export const DASHBOARD_SETUP_STEP_KEYS = [
  'langame',
  'clubs',
  'staff',
  'mission',
  'dailyReport',
] as const;

export type DashboardSetupStepKey = (typeof DASHBOARD_SETUP_STEP_KEYS)[number];

export type DashboardSetupProgress = {
  steps: Array<{ key: DashboardSetupStepKey; done: boolean }>;
  completed: number;
  total: number;
  /** False until the first sale or game session reaches the network. */
  hasData: boolean;
};

/** The name a platform admin gives the first club of a new network. */
export const TEMPORARY_FIRST_STORE_NAME = 'Компьютерный клуб 1';

export type DashboardSetupFacts = {
  activeLangameSources: number;
  activeStores: Array<{
    name: string;
    externalDomain: string | null;
    integrationSourceId: string | null;
  }>;
  staffAccounts: number;
  openStaffInvites: number;
  launchedMissions: number;
  sentDailyReports: number;
  hasSales: boolean;
  hasGameSessions: boolean;
};

export function buildDashboardSetupProgress(
  facts: DashboardSetupFacts,
): DashboardSetupProgress {
  const clubsChecked =
    facts.activeStores.length > 0 &&
    facts.activeStores.every(
      (store) =>
        store.name.trim() !== TEMPORARY_FIRST_STORE_NAME &&
        Boolean(store.integrationSourceId || store.externalDomain?.trim()),
    );
  const done: Record<DashboardSetupStepKey, boolean> = {
    langame: facts.activeLangameSources > 0,
    clubs: clubsChecked,
    staff: facts.staffAccounts + facts.openStaffInvites > 0,
    mission: facts.launchedMissions > 0,
    dailyReport: facts.sentDailyReports > 0,
  };
  const steps = DASHBOARD_SETUP_STEP_KEYS.map((key) => ({
    key,
    done: done[key],
  }));

  return {
    steps,
    completed: steps.filter((step) => step.done).length,
    total: steps.length,
    hasData: facts.hasSales || facts.hasGameSessions,
  };
}
