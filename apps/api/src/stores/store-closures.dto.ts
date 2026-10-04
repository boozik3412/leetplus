/** First closed club-local day, `YYYY-MM-DD`. */
export type CreateStoreClosureDto = {
  closedFrom: string;
  /** First day the club is open again; omitted or null while it is closed. */
  reopenedOn?: string | null;
  reason?: string | null;
};

export type UpdateStoreClosureDto = {
  closedFrom?: string;
  /** A date reopens the club, null makes the closure open-ended again. */
  reopenedOn?: string | null;
  reason?: string | null;
};
