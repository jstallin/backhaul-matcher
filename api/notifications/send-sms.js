import twilio from 'twilio';

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

  // Check environment variables
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  console.log('🔍 Twilio config check:', {
    hasSid: !!accountSid,
    hasToken: !!authToken,
    hasPhone: !!fromNumber,
    sidPrefix: accountSid?.substring(0, 5)
  });

  // Validate Twilio is configured
  if (!accountSid || !authToken || !fromNumber) {
    console.error('❌ Twilio not configured. Missing:', {
      TWILIO_ACCOUNT_SID: !accountSid,
      TWILIO_AUTH_TOKEN: !authToken,
      TWILIO_PHONE_NUMBER: !fromNumber
    });
    return res.status(500).json({ 
      success: false, 
      error: 'SMS service not configured - missing environment variables' 
    });
  }

  console.log('📱 Sending SMS via Twilio:', { to, from: from || fromNumber });

  try {
    // Initialize Twilio client inside handler
    const client = twilio(accountSid, authToken);
    
    const result = await client.messages.create({
      body: message,
      from: from || fromNumber,
      to: to
    });

    console.log('✅ SMS sent successfully:', result.sid);
    return res.status(200).json({ 
      success: true, 
      messageId: result.sid 
    });

  } catch (error) {
    console.error('❌ SMS error:', {
      message: error.message,
      code: error.code,
      status: error.status
    });
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      code: error.code
    });
  }
}
