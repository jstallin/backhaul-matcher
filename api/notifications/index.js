import twilio from 'twilio';
import { Resend } from 'resend';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return res.status(500).json({ success: false, error: 'SMS service not configured' });
    }

    try {
      const client = twilio(accountSid, authToken);
      const result = await client.messages.create({ body: message, from: from || fromNumber, to });
      return res.status(200).json({ success: true, messageId: result.sid });
    } catch (error) {
      console.error('SMS error:', error.message);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }
  }

  return res.status(400).json({ error: 'Missing ?type=email or ?type=sms' });
}
