import { supabase } from '../lib/supabase';

// #129: fetch the caller's org members for the fleet-share picker + owner-name
// resolution. Reuses GET /api/orgs/members (any org member may read). Returns
// [{ user_id, email, full_name, role }] or [] when not in an org / on error.
export async function fetchOrgMembers() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return [];
    const res = await fetch('/api/orgs/members', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.members || [];
  } catch {
    return [];
  }
}

// Display label for a member, given the members list and a user_id.
export function memberName(members, userId) {
  const m = (members || []).find(x => x.user_id === userId);
  return m?.full_name || m?.email || null;
}
