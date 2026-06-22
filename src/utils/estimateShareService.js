/**
 * Estimate Share Service (#175)
 * Builds the channel-specific content for an estimate report and posts to the
 * existing share endpoint (api/loads/share) with the session token. No map stops
 * are sent (an estimate has no single lane), so the endpoint skips the route map.
 * Shares are logged with load_source='estimate', load_id=null.
 */
import { supabase } from '../lib/supabase';
import {
  buildEstimateSubject,
  buildEstimateText,
  buildEstimateHtml,
  buildEstimateCopyText,
} from './estimateShareContent';

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
 * Share an estimate report via email, text, or copy.
 * @param {Object} p
 * @param {'email'|'text'|'copy'} p.channel
 * @param {string|null} p.recipient - email | E.164 phone (+1XXXXXXXXXX); null for copy
 * @param {string} p.note - user note (caps enforced by the dialog inputs)
 * @param {Object} p.estimate - the estimate_requests row
 * @param {Object|null} p.fleet - fleet row or null (fleet-less estimate)
 * @param {Object} p.metrics - computeMetrics() output
 * @param {number} p.annualVolume
 * @param {Object} p.user - logged-in Supabase user (sender identity)
 */
export async function shareEstimate({ channel, recipient = null, note = '', estimate, fleet, metrics, annualVolume, user }) {
  const ctx = { estimate, fleet, metrics, annualVolume };
  const body = { channel, recipient, loadId: null, loadSource: 'estimate' };

  if (channel === 'email') {
    body.subject = buildEstimateSubject(senderName(user), estimate);
    body.text = [note, '', buildEstimateText(ctx, { size: 'rich' })].filter(Boolean).join('\n');
    body.html = buildEstimateHtml(ctx, { note, senderName: senderName(user) });
    // No stops → the endpoint skips the route map (an estimate spans many lanes).
  } else if (channel === 'text') {
    body.text = [note, buildEstimateText(ctx, { size: 'compact' })].filter(Boolean).join('\n\n');
  }
  // channel === 'copy' → no content sent; the clipboard write happens in the menu,
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

/** Clipboard content for the Copy channel. */
export function buildEstimateClipboard(ctx) {
  return buildEstimateCopyText(ctx);
}
