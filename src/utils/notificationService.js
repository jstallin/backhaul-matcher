/**
 * Notification Service
 * Handles sending email and SMS notifications for backhaul changes
 */

const NOTIFICATION_API_URL = import.meta.env.VITE_NOTIFICATION_API_URL || '/api/notifications';

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
    changeType
  } = params;

  console.log('📧 Sending notification:', { method, email, phone, changeType });

  // Build notification message
  const message = buildNotificationMessage(requestName, fleetName, oldTopMatch, newTopMatch, changeType);

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
const buildNotificationMessage = (requestName, fleetName, oldTopMatch, newTopMatch, changeType) => {
  let subject, emailBody, emailHtml, smsBody;

  const newRevenue = newTopMatch?.totalRevenue || 0;
  const newRPM = newTopMatch?.revenuePerMile || 0;
  const newRoute = `${newTopMatch?.origin?.city}, ${newTopMatch?.origin?.state} → ${newTopMatch?.destination?.city}, ${newTopMatch?.destination?.state}`;

  switch (changeType) {
    case 'new_top':
      subject = `🎯 New Top Backhaul for ${requestName}`;
      smsBody = `New top backhaul for ${requestName}: $${newRevenue.toFixed(2)} (${newRoute}). Check Haul Monitor for details.`;
      emailBody = `A new top backhaul opportunity is available for your request "${requestName}".\n\nRoute: ${newRoute}\nRevenue: $${newRevenue.toFixed(2)}\nRate: $${newRPM.toFixed(2)}/mile\n\nLog in to Haul Monitor to view details and book.`;
      emailHtml = buildEmailHtml(subject, [
        { label: 'Request', value: requestName },
        { label: 'Fleet', value: fleetName },
        { label: 'Route', value: newRoute },
        { label: 'Revenue', value: `$${newRevenue.toFixed(2)}` },
        { label: 'Rate', value: `$${newRPM.toFixed(2)}/mile` }
      ]);
      break;

    case 'price_increase':
      const oldRevenue = oldTopMatch?.totalRevenue || 0;
      const increase = newRevenue - oldRevenue;
      subject = `📈 Price Increase for ${requestName}`;
      smsBody = `Top backhaul price increased by $${increase.toFixed(2)} for ${requestName}. Now $${newRevenue.toFixed(2)}. Check Haul Monitor.`;
      emailBody = `The top backhaul opportunity for "${requestName}" has increased in price.\n\nRoute: ${newRoute}\nNew Revenue: $${newRevenue.toFixed(2)} (was $${oldRevenue.toFixed(2)})\nIncrease: +$${increase.toFixed(2)}\n\nLog in to Haul Monitor to view details.`;
      emailHtml = buildEmailHtml(subject, [
        { label: 'Request', value: requestName },
        { label: 'Route', value: newRoute },
        { label: 'Old Price', value: `$${oldRevenue.toFixed(2)}` },
        { label: 'New Price', value: `$${newRevenue.toFixed(2)}`, highlight: true },
        { label: 'Increase', value: `+$${increase.toFixed(2)}`, highlight: true }
      ]);
      break;

    case 'price_decrease':
      const oldRev = oldTopMatch?.totalRevenue || 0;
      const decrease = oldRev - newRevenue;
      subject = `📉 Price Change for ${requestName}`;
      smsBody = `Top backhaul price decreased by $${decrease.toFixed(2)} for ${requestName}. Now $${newRevenue.toFixed(2)}.`;
      emailBody = `The top backhaul opportunity for "${requestName}" has decreased in price.\n\nRoute: ${newRoute}\nNew Revenue: $${newRevenue.toFixed(2)} (was $${oldRev.toFixed(2)})\nDecrease: -$${decrease.toFixed(2)}`;
      emailHtml = buildEmailHtml(subject, [
        { label: 'Request', value: requestName },
        { label: 'Route', value: newRoute },
        { label: 'Old Price', value: `$${oldRev.toFixed(2)}` },
        { label: 'New Price', value: `$${newRevenue.toFixed(2)}` }
      ]);
      break;

    default:
      subject = `Backhaul Update for ${requestName}`;
      smsBody = `Backhaul update for ${requestName}. Check Haul Monitor for details.`;
      emailBody = `There's an update for your backhaul request "${requestName}". Log in to Haul Monitor to view details.`;
      emailHtml = buildEmailHtml(subject, [
        { label: 'Request', value: requestName }
      ]);
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
  
  // Example with fetch to your backend API endpoint
  const response = await fetch(`${NOTIFICATION_API_URL}/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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
 * Send SMS notification via Twilio
 */
const sendSMS = async ({ to, message }) => {
  // Twilio integration - requires API keys
  console.log('📱 Sending SMS:', { to, message });
  
  const TWILIO_ACCOUNT_SID = import.meta.env.VITE_TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = import.meta.env.VITE_TWILIO_AUTH_TOKEN;
  const TWILIO_PHONE_NUMBER = import.meta.env.VITE_TWILIO_PHONE_NUMBER;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.warn('⚠️ Twilio credentials not configured. Skipping SMS.');
    return { success: false, message: 'Twilio not configured' };
  }

  // Send via your backend API (more secure than client-side)
  const response = await fetch(`${NOTIFICATION_API_URL}/send-sms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to,
      message,
      from: TWILIO_PHONE_NUMBER
    })
  });

  if (!response.ok) {
    throw new Error('Failed to send SMS');
  }

  return response.json();
};

/**
 * Build HTML email template
 */
const buildEmailHtml = (title, fields) => {
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
                <td style="padding: 32px; background: linear-gradient(135deg, #D89F38 0%, #E8B55E 100%); border-radius: 8px 8px 0 0;">
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
                          <span style="color: ${field.highlight ? '#D89F38' : '#2C3744'}; font-size: 16px; font-weight: ${field.highlight ? '700' : '600'};">
                            ${field.value}
                          </span>
                        </td>
                      </tr>
                    `).join('')}
                  </table>
                  
                  <div style="margin-top: 32px; text-align: center;">
                    <a href="https://backhaul-matcher.vercel.app" style="display: inline-block; padding: 14px 32px; background-color: #D89F38; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px;">
                      View in Haul Monitor
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
  if (!oldMatches || oldMatches.length === 0) {
    // First time running - no changes to detect
    return null;
  }

  if (!newMatches || newMatches.length === 0) {
    // No matches found anymore
    return null;
  }

  const oldTop = oldMatches[0];
  const newTop = newMatches[0];

  // Check if top match changed
  if (oldTop.load_id !== newTop.load_id) {
    return {
      type: 'new_top',
      oldMatch: oldTop,
      newMatch: newTop
    };
  }

  // Check if price changed significantly (more than $10)
  const priceDiff = newTop.totalRevenue - oldTop.totalRevenue;
  if (Math.abs(priceDiff) >= 10) {
    return {
      type: priceDiff > 0 ? 'price_increase' : 'price_decrease',
      oldMatch: oldTop,
      newMatch: newTop
    };
  }

  // No material change
  return null;
};
