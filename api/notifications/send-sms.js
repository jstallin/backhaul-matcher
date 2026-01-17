import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { to, message, from } = req.body;

  // Validate required fields
  if (!to || !message) {
    return res.status(400).json({ error: 'Missing required fields: to, message' });
  }

  // Validate Twilio is configured
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    console.error('❌ Twilio not configured');
    return res.status(500).json({ 
      success: false, 
      error: 'SMS service not configured' 
    });
  }

  console.log('📱 Sending SMS via Twilio:', { to });

  try {
    const result = await client.messages.create({
      body: message,
      from: from || process.env.TWILIO_PHONE_NUMBER,
      to: to
    });

    console.log('✅ SMS sent successfully:', result.sid);
    return res.status(200).json({ 
      success: true, 
      messageId: result.sid 
    });

  } catch (error) {
    console.error('❌ SMS error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
