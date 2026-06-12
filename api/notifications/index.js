import twilio from 'twilio';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { brandSms } from '../../src/utils/smsBody.js';
import { toE164 } from '../../src/utils/phone.js';

// #57: this endpoint sends email (Resend) and SMS (Twilio) on our account, so it must
// not be open. It is client-facing only (the cron uses the SDKs directly), so we require
// a valid Supabase session JWT and restrict CORS to our own app origins.
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const ALLOWED_ORIGINS = [
  'https://haulmonitor.cloud',
  'https://www.haulmonitor.cloud',
  'https://staging.haulmonitor.cloud',
  'https://backhaul-matcher-staging.vercel.app',
  'http://localhost:5173',
];

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Require a valid authenticated session (#57).
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }

  const type = req.query.type;

  if (type === 'email') {
    const { to, subject, text, html } = req.body;
    if (!to || !subject) return res.status(400).json({ error: 'Missing required fields: to, subject' });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: 'Email service not configured' });

    try {
      const resend = new Resend(apiKey);
      const data = await resend.emails.send({
        from: 'Haul Monitor <notifications@haulmonitor.cloud>',
        to: [to],
        subject,
        text: text || '',
        html: html || text || '',
      });
      return res.status(200).json({ success: true, messageId: data.id });
    } catch (error) {
      console.error('Email error:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (type === 'sms') {
    const { to, message, from } = req.body;
    if (!to || !message) return res.status(400).json({ error: 'Missing required fields: to, message' });
    // Twilio requires E.164 (+1XXXXXXXXXX); fleet phones are stored free-form.
    const e164To = toE164(to);
    if (!e164To) return res.status(400).json({ success: false, error: 'Invalid phone number (expected US 10-digit or E.164)' });

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return res.status(500).json({ success: false, error: 'SMS service not configured' });
    }

    try {
      const client = twilio(accountSid, authToken);
      const result = await client.messages.create({ body: brandSms(message), from: from || fromNumber, to: e164To }); // #140
      return res.status(200).json({ success: true, messageId: result.sid });
    } catch (error) {
      console.error('SMS error:', error.message);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }
  }

  return res.status(400).json({ error: 'Missing ?type=email or ?type=sms' });
}
