// Shared list of backhaul-request cancellation reasons (issue #37), used by both
// v1 (BackhaulResults cancel dialog) and v2 (SearchView delete/cancel dialog) so the
// options can't drift. `value` is persisted to backhaul_requests.cancellation_reason.
export const CANCELLATION_REASONS = [
  { value: 'accident', label: 'ACCIDENT' },
  { value: 'weather', label: 'WEATHER' },
  { value: 'illness', label: 'ILLNESS' },
  { value: 'returns', label: 'RETURNS' },
  { value: 'hours_of_service', label: 'HOURS OF SERVICE' },
  { value: 'no_load_avail', label: 'NO LOAD AVAIL' },
];
