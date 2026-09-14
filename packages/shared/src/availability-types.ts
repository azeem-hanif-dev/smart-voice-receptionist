export interface Slot {
  /** Customer-facing start, ISO 8601 UTC. */
  start: string;
  /** Customer-facing end, ISO 8601 UTC. */
  end: string;
  providerId: string;
  providerName?: string;
  /** Local wall-clock label for display, e.g. "Tue 9 Sep, 10:30". */
  label?: string;
}
