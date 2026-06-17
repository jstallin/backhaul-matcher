// Shared, isomorphic builder for backhaul change notifications (subject, plain text,
// HTML, SMS). Imported by BOTH the client polling path (src/utils/notificationService.js)
// and the server auto-refresh cron (api/cron/refresh-requests.js) so the two never drift
// in copy, HTML styling, or deep-link format.
//
// Notes:
//  - Server import: api/ runs as native Node ESM — import this with an explicit `.js`
//    extension. This module is intentionally environment-agnostic: no `window`, no
//    `import.meta`, no browser/Node-only APIs. The caller supplies the link base.
//  - SMS branding + opt-out (brandSms) is applied downstream at the Twilio send points,
//    so the `sms` text produced here must stay unbranded.

const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

// Route label from a match. Arrow defaults to → for email/UI; pass '->' for SMS to stay
// in GSM-7 (a Unicode arrow forces UCS-2, ~halving the per-segment budget).
const routeOf = (m, arrow = '→') =>
  m ? `${m.origin?.city}, ${m.origin?.state} ${arrow} ${m.destination?.city}, ${m.destination?.state}` : '';

/**
 * Deep-link to a request's results (#51): `{base}/app?request={id}`.
 * This is the exact path/query the cron has always produced and that's confirmed to open
 * the request and surface the load named in the notification. Base host is supplied by the
 * caller (cron: VITE_APP_URL/apex; client: VITE_APP_URL/current origin) so the link points
 * at the right environment, while the path stays identical across both paths.
 */
export const buildRequestLink = (baseUrl, requestId) => {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  return requestId ? `${base}/app?request=${requestId}` : `${base}/app`;
};

/**
 * Branded HTML email template — green header, labeled rows, "View this request" CTA.
 * @param {string} title
 * @param {Array<{label:string,value:string,highlight?:boolean}>} fields
 * @param {string} link
 */
export const buildEmailHtml = (title, fields, link = 'https://www.haulmonitor.cloud/app') => {
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
 * Build the full notification payload (email + SMS) for a detected change.
 * @param {object} change - from detectNotifiableChange (notificationChangeDetection.js):
 *   { type: 'new_top'|'top_net_up'|'lane_softening', match?, newNet?, avgNet?, pct? }
 * @param {object} ctx - { requestName, fleetName?, link }
 * @returns {{ subject: string, text: string, html: string, sms: string }}
 */
export const buildBackhaulNotification = (change, { requestName, fleetName, link } = {}) => {
  const newNet = Number(change?.newNet || 0);
  const route = routeOf(change?.match);
  const smsRoute = routeOf(change?.match, '->');
  const smsLink = link ? ` View: ${link}` : '';
  const fleetRow = fleetName ? [{ label: 'Fleet', value: fleetName }] : [];

  let subject, text, sms, fields;
  switch (change?.type) {
    case 'new_top':
      subject = `🎯 New top backhaul for ${requestName}`;
      text = `A new #1 backhaul opportunity is available for "${requestName}".\n\nRoute: ${route}\nNet revenue: ${fmt(newNet)}\n\nView this request: ${link}`;
      sms = `New #1 backhaul for ${requestName}: ${fmt(newNet)} net (${smsRoute}).${smsLink}`;
      fields = [{ label: 'Request', value: requestName }, ...fleetRow, { label: 'Route', value: route }, { label: 'Net Revenue', value: fmt(newNet), highlight: true }];
      break;

    case 'top_net_up': {
      const pct = Math.round(change?.pct || 0);
      subject = `📈 Top backhaul improved for ${requestName}`;
      text = `Your top backhaul's net revenue rose ${pct}% for "${requestName}".\n\nRoute: ${route}\nNet revenue: ${fmt(newNet)}\n\nView this request: ${link}`;
      sms = `Top backhaul up ${pct}% for ${requestName} (${smsRoute}): ${fmt(newNet)} net.${smsLink}`;
      fields = [{ label: 'Request', value: requestName }, ...fleetRow, { label: 'Route', value: route }, { label: 'Net Revenue', value: fmt(newNet), highlight: true }];
      break;
    }

    case 'lane_softening': {
      const pct = Math.abs(Math.round(change?.pct || 0));
      const avg = fmt(change?.avgNet);
      subject = `📉 Lane softening for ${requestName}`;
      text = `Average net revenue across your top loads for "${requestName}" is down ${pct}% (avg ${avg}). You may want to act soon.\n\nView this request: ${link}`;
      sms = `Heads up: top loads for ${requestName} softening (avg ${avg} net).${smsLink}`;
      fields = [{ label: 'Request', value: requestName }, ...fleetRow, { label: 'Avg Net (top loads)', value: avg, highlight: true }, { label: 'Change', value: `▼ ${pct}%` }];
      break;
    }

    default:
      subject = `Backhaul update for ${requestName}`;
      text = `There's an update for your backhaul request "${requestName}".\n\nView this request: ${link}`;
      sms = `Backhaul update for ${requestName}.${smsLink}`;
      fields = [{ label: 'Request', value: requestName }, ...fleetRow];
  }

  const html = buildEmailHtml(subject, fields, link);
  return { subject, text, html, sms };
};
