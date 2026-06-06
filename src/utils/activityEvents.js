// Issue #85: client-side activity telemetry for the admin Org Activity panel.
// Fire-and-forget — telemetry must NEVER break or slow the user action it
// observes, so failures are logged and swallowed. RLS limits inserts to the
// caller's own user_id.
import { supabase } from '../lib/supabase';

export const ACTIVITY_EVENTS = {
  SEARCH_RUN: 'search_run',          // metadata.kind = 'backhaul' | 'estimate'
  LOAD_DETAIL_OPEN: 'load_detail_open',
};

export function logActivityEvent(eventType, metadata = {}) {
  // Resolve the user from the cached session; skip silently when logged out.
  supabase.auth.getSession().then(({ data: { session } }) => {
    const userId = session?.user?.id;
    if (!userId) return;
    return supabase.from('user_activity_events').insert({
      user_id: userId,
      event_type: eventType,
      metadata,
    });
  }).then((result) => {
    if (result?.error) console.error('Activity event insert failed:', result.error.message);
  }).catch((err) => {
    console.error('Activity event failed:', err?.message || err);
  });
}
