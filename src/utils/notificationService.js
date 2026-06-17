/**
 * Notification Service
 * Handles sending email and SMS notifications for backhaul changes
 */
import { detectNotifiableChange, snapshotFromMatches } from './notificationChangeDetection';
import { buildBackhaulNotification, buildRequestLink } from './notificationEmail';
import { isWithinNotifyWindow, DEFAULT_TZ } from './quietHours';
import { supabase } from '../lib/supabase';

const NOTIFICATION_API_URL = import.meta.env.VITE_NOTIFICATION_API_URL || '/api/notifications';
// Deep-link base — prefer the configured app URL (matches the cron), fall back to the
// current origin so links stay correct on staging/localhost when VITE_APP_URL is unset.
const APP_BASE_URL = import.meta.env.VITE_APP_URL
  || (typeof window !== 'undefined' ? window.location.origin : 'https://haulmonitor.cloud');

// #57: the notifications endpoint now requires a valid session — attach the user's token.
const authHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
};

/**
 * Send a notification about backhaul changes
 * 
 * @param {Object} params - Notification parameters
 * @param {string} params.method - 'email', 'text', or 'both'
 * @param {string} params.email - Recipient email address
 * @param {string} params.phone - Recipient phone number (for SMS)
 * @param {string} params.requestName - Name of the request
 * @param {string} params.fleetName - Name of the fleet
 * @param {Object} params.change - Change descriptor from detectBackhaulChanges
 *   ({ type, match, newNet, pct, avgNet, ... })
 */
export const sendBackhaulChangeNotification = async (params) => {
  const {
    method,
    email,
    phone,
    requestName,
    fleetName,
    change,
    requestId
  } = params;

  console.log('📧 Sending notification:', { method, email, phone, changeType: change?.type });

  // Deep-link to this request's results (#51) — same `{base}/app?request={id}` format the
  // cron uses (confirmed to open the request + surface the load).
  const link = buildRequestLink(APP_BASE_URL, requestId);

  // Build email + SMS via the shared builder so client + cron stay identical (HTML + copy).
  const message = buildBackhaulNotification(change, { requestName, fleetName, link });

  // Quiet hours (both channels): suppress outside the recipient's local 8 AM–9 PM.
  // The recipient is the viewer here, so use the browser's timezone.
  const viewerTz = (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || DEFAULT_TZ;
  if (!isWithinNotifyWindow(new Date(), viewerTz)) {
    console.log(`🌙 Quiet hours (${viewerTz}) — suppressing notification`);
    return { success: true, suppressed: true };
  }

  try {
    // Send based on method
    if (method === 'email' || method === 'both') {
      if (email) {
        await sendEmail({
          to: email,
          subject: message.subject,
          body: message.text,
          html: message.html
        });
        console.log('✅ Email notification sent to:', email);
      }
    }

    if (method === 'text' || method === 'both') {
      if (phone) {
        await sendSMS({
          to: phone,
          message: message.sms
        });
        console.log('✅ SMS notification sent to:', phone);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send email notification
 */
const sendEmail = async ({ to, subject, body, html }) => {
  // For now, this is a placeholder
  // You'll need to implement with your email service (SendGrid, Resend, etc.)
  
  console.log('📧 Sending email:', { to, subject });
  
  const response = await fetch(`${NOTIFICATION_API_URL}?type=email`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      to,
      subject,
      text: body,
      html
    })
  });

  if (!response.ok) {
    throw new Error('Failed to send email');
  }

  return response.json();
};

/**
 * Send SMS notification via Twilio OR Email-to-SMS gateway
 */
const sendSMS = async ({ to, message }) => {
  console.log('📱 Sending SMS via server (Twilio):', { to });

  // Route through the server endpoint so the Twilio auth token stays server-only
  // (item #52). The endpoint (api/notifications?type=sms) does the real Twilio send.
  const response = await fetch(`${NOTIFICATION_API_URL}?type=sms`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ to, message }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.warn('⚠️ SMS send failed:', err.error || response.status);
    return { success: false, error: err.error || 'Failed to send SMS' };
  }

  return response.json();
};

/**
 * Detect material changes in backhaul results
 */
export const detectBackhaulChanges = (oldMatches, newMatches) => {
  // Delegate to the shared, unit-tested net-based detector so client polling and the
  // server cron agree on what's "material" (item #48). Preserves the {type, oldMatch,
  // newMatch} contract the callers expect, plus carries pct/avgNet for messaging.
  if (!oldMatches || oldMatches.length === 0) return null;
  const change = detectNotifiableChange(snapshotFromMatches(oldMatches), newMatches);
  if (!change) return null;
  return { ...change, oldMatch: oldMatches[0], newMatch: newMatches[0] };
};
