/**
 * Notification Service
 * Handles sending email and SMS notifications for backhaul changes
 */
import { detectNotifiableChange, snapshotFromMatches, netOf } from './notificationChangeDetection';
import { supabase } from '../lib/supabase';

const NOTIFICATION_API_URL = import.meta.env.VITE_NOTIFICATION_API_URL || '/api/notifications';

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
 * @param {Object} params.oldTopMatch - Previous top match
 * @param {Object} params.newTopMatch - New top match
 * @param {string} params.changeType - Type of change: 'new_top', 'price_increase', 'price_decrease'
 */
export const sendBackhaulChangeNotification = async (params) => {
  const {
    method,
    email,
    phone,
    requestName,
    fleetName,
    oldTopMatch,
    newTopMatch,
    changeType,
    requestId
  } = params;

  console.log('📧 Sending notification:', { method, email, phone, changeType });

  // Deep-link to this request's results (#51). Uses the current origin (www on prod).
  const link = requestId
    ? `${(typeof window !== 'undefined' ? window.location.origin : '')}/app?request=${requestId}`
    : (typeof window !== 'undefined' ? window.location.origin : '');

  // Build notification message
  const message = buildNotificationMessage(requestName, fleetName, oldTopMatch, newTopMatch, changeType, link);

  try {
    // Send based on method
    if (method === 'email' || method === 'both') {
      if (email) {
        await sendEmail({
          to: email,
          subject: message.subject,
          body: message.emailBody,
          html: message.emailHtml
        });
        console.log('✅ Email notification sent to:', email);
      }
    }

    if (method === 'text' || method === 'both') {
      if (phone) {
        await sendSMS({
          to: phone,
          message: message.smsBody
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
 * Build notification message based on change type
 */
const buildNotificationMessage = (requestName, fleetName, oldTopMatch, newTopMatch, changeType, link = '') => {
  let subject, emailBody, emailHtml, smsBody;

  const newNet = netOf(newTopMatch);
  const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const newRoute = `${newTopMatch?.origin?.city}, ${newTopMatch?.origin?.state} → ${newTopMatch?.destination?.city}, ${newTopMatch?.destination?.state}`;
  // GSM-7-safe arrow for SMS — a Unicode → forces UCS-2 and ~halves the per-segment budget.
  const smsRoute = newRoute.replace('→', '->');
  const smsLink = link ? ` View: ${link}` : '';

  switch (changeType) {
    case 'new_top':
      subject = `🎯 New top backhaul for ${requestName}`;
      smsBody = `New #1 backhaul for ${requestName}: ${fmt(newNet)} net (${smsRoute}).${smsLink}`;
      emailBody = `A new #1 backhaul opportunity is available for "${requestName}".\n\nRoute: ${newRoute}\nNet revenue: ${fmt(newNet)}\n\nView this request: ${link}`;
      emailHtml = buildEmailHtml(subject, [
        { label: 'Request', value: requestName },
        { label: 'Fleet', value: fleetName },
        { label: 'Route', value: newRoute },
        { label: 'Net Revenue', value: fmt(newNet), highlight: true }
      ], link);
      break;

    case 'top_net_up':
      subject = `📈 Top backhaul improved for ${requestName}`;
      smsBody = `Top backhaul net revenue improved for ${requestName}: now ${fmt(newNet)} (${smsRoute}).${smsLink}`;
      emailBody = `Your top backhaul's net revenue improved for "${requestName}".\n\nRoute: ${newRoute}\nNet revenue: ${fmt(newNet)}\n\nView this request: ${link}`;
      emailHtml = buildEmailHtml(subject, [
        { label: 'Request', value: requestName },
        { label: 'Route', value: newRoute },
        { label: 'Net Revenue', value: fmt(newNet), highlight: true }
      ], link);
      break;

    case 'lane_softening':
      subject = `📉 Lane softening for ${requestName}`;
      smsBody = `Heads up: average net revenue across your top loads for ${requestName} is softening.${smsLink}`;
      emailBody = `Average net revenue across your top loads for "${requestName}" is softening — you may want to act soon.\n\nView this request: ${link}`;
      emailHtml = buildEmailHtml(subject, [
        { label: 'Request', value: requestName },
        { label: 'Signal', value: 'Top-loads net revenue softening', highlight: true }
      ], link);
      break;

    default:
      subject = `Backhaul Update for ${requestName}`;
      smsBody = `Backhaul update for ${requestName}.${smsLink}`;
      emailBody = `There's an update for your backhaul request "${requestName}".\n\nView this request: ${link}`;
      emailHtml = buildEmailHtml(subject, [
        { label: 'Request', value: requestName }
      ], link);
  }

  return { subject, emailBody, emailHtml, smsBody };
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
 * Build HTML email template
 */
const buildEmailHtml = (title, fields, link = 'https://www.haulmonitor.cloud/app') => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <!-- Header -->
              <tr>
                <td style="padding: 32px; background: linear-gradient(135deg, #008b00 0%, #00a300 100%); border-radius: 8px 8px 0 0;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 900;">
                    🦎 Haul Monitor
                  </h1>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 32px;">
                  <h2 style="margin: 0 0 24px 0; color: #2C3744; font-size: 20px; font-weight: 700;">
                    ${title}
                  </h2>
                  
                  <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    ${fields.map(field => `
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB;">
                          <strong style="color: #6B7280; font-size: 14px;">${field.label}:</strong>
                        </td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; text-align: right;">
                          <span style="color: ${field.highlight ? '#008b00' : '#2C3744'}; font-size: 16px; font-weight: ${field.highlight ? '700' : '600'};">
                            ${field.value}
                          </span>
                        </td>
                      </tr>
                    `).join('')}
                  </table>
                  
                  <div style="margin-top: 32px; text-align: center;">
                    <a href="${link}" style="display: inline-block; padding: 14px 32px; background-color: #008b00; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px;">
                      View this request
                    </a>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 24px 32px; background-color: #F9FAFB; border-radius: 0 0 8px 8px; text-align: center;">
                  <p style="margin: 0; color: #6B7280; font-size: 12px;">
                    You're receiving this because you enabled notifications for this backhaul request.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
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
