/**
 * Load Share Service (#82)
 * Client wrapper for the share endpoint: builds the channel-specific content
 * via loadShareContent and posts to api/loads/share with the session token.
 */
import { supabase } from '../lib/supabase';
import {
  buildShareSubject,
  buildShareText,
  buildShareHtml,
  buildShareMapStops,
} from './loadShareContent';

const SHARE_API_URL = '/api/loads/share';

const authHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
};

const senderName = (user) =>
  user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'A Haul Monitor user';

/**
 * Share a load via email, text, or copy.
 * @param {Object} p
 * @param {'email'|'text'|'copy'} p.channel
 * @param {string|null} p.recipient - email address or E.164 phone (+1XXXXXXXXXX); null for copy
 * @param {string} p.note - user note (caps enforced by the dialog inputs)
 * @param {Object} p.match - normalized match object from routeHomeMatching
 * @param {Object} p.request - the backhaul request (datum context)
 * @param {Object} p.fleetHome - { address, lat, lng } for the map's final stop
 * @param {Object} p.user - logged-in Supabase user (sender identity)
 */
export async function shareLoad({ channel, recipient = null, note = '', match, request, fleetHome, user }) {
  const loadId = match.load_id || match.source_load_id || null;
  const loadSource = match.source || null;

  const body = { channel, recipient, loadId, loadSource };

  if (channel === 'email') {
    body.subject = buildShareSubject(senderName(user), match);
    body.text = [note, '', buildShareText(match, request, { size: 'rich' })].filter(Boolean).join('\n');
    body.html = buildShareHtml(match, request, { note, senderName: senderName(user), mapCid: 'routemap' });
    body.stops = buildShareMapStops(match, request, fleetHome);
  } else if (channel === 'text') {
    body.text = [note, buildShareText(match, request, { size: 'compact' })].filter(Boolean).join('\n\n');
  }
  // channel === 'copy' → no content sent; the clipboard write happens in the dialog,
  // this call only logs the share.

  const response = await fetch(SHARE_API_URL, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Share failed (${response.status})`);
  }
  return data;
}

/** Clipboard content for the Copy channel: rich summary, no map. */
export function buildCopyText({ match, request }) {
  return buildShareText(match, request, { size: 'rich' });
}
