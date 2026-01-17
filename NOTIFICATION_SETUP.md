/**
 * Backend API for Notifications
 * 
 * This file shows what you need to implement on your backend (e.g., Vercel serverless functions)
 * to handle email and SMS notifications securely.
 * 
 * WHY BACKEND? API keys should NEVER be exposed in frontend code.
 */

// Example: Vercel Serverless Function
// File: /api/notifications/send-email.js

import { Resend } from 'resend'; // or SendGrid, Mailgun, etc.

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, subject, text, html } = req.body;

  try {
    const data = await resend.emails.send({
      from: 'Haul Monitor <notifications@haulmonitor.com>',
      to: [to],
      subject: subject,
      text: text,
      html: html,
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Email error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// =============================================================================
// Example: SMS with Twilio
// File: /api/notifications/send-sms.js

import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, message, from } = req.body;

  try {
    const result = await client.messages.create({
      body: message,
      from: from || process.env.TWILIO_PHONE_NUMBER,
      to: to
    });

    return res.status(200).json({ success: true, messageId: result.sid });
  } catch (error) {
    console.error('SMS error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// =============================================================================
// SETUP INSTRUCTIONS:
// =============================================================================

/**
 * 1. EMAIL SETUP (Choose one):
 * 
 * A. Resend (Recommended - Easy & Free tier)
 *    - Sign up: https://resend.com
 *    - Get API key
 *    - Install: npm install resend
 *    - Add to .env: RESEND_API_KEY=re_xxxxx
 *    - Verify your domain
 * 
 * B. SendGrid
 *    - Sign up: https://sendgrid.com
 *    - Get API key
 *    - Install: npm install @sendgrid/mail
 *    - Add to .env: SENDGRID_API_KEY=SG.xxxxx
 * 
 * C. AWS SES
 *    - Setup AWS account
 *    - Verify email/domain
 *    - Get credentials
 *    - Install: npm install @aws-sdk/client-ses
 */

/**
 * 2. SMS SETUP (Twilio):
 * 
 * - Sign up: https://www.twilio.com
 * - Get Account SID and Auth Token
 * - Buy a phone number ($1/month)
 * - Install: npm install twilio
 * - Add to .env:
 *   TWILIO_ACCOUNT_SID=ACxxxxx
 *   TWILIO_AUTH_TOKEN=xxxxx
 *   TWILIO_PHONE_NUMBER=+1234567890
 * 
 * COSTS:
 * - Outbound SMS: ~$0.0075 per message in US
 * - Phone number: ~$1.00 per month
 */

/**
 * 3. VERCEL DEPLOYMENT:
 * 
 * Create these files in your project:
 * 
 * /api/notifications/send-email.js
 * /api/notifications/send-sms.js
 * 
 * Add environment variables in Vercel dashboard:
 * - RESEND_API_KEY (or SENDGRID_API_KEY)
 * - TWILIO_ACCOUNT_SID
 * - TWILIO_AUTH_TOKEN
 * - TWILIO_PHONE_NUMBER
 * 
 * Deploy: vercel --prod
 */

/**
 * 4. FRONTEND CONFIGURATION:
 * 
 * In your .env file:
 * VITE_NOTIFICATION_API_URL=https://your-domain.vercel.app/api/notifications
 * 
 * Or if using same domain:
 * VITE_NOTIFICATION_API_URL=/api/notifications
 */
