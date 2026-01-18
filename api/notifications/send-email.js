import { Resend } from 'resend';

export default async function handler(req, res) {
  // Only allow POST requests temp
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers (adjust domain as needed)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { to, subject, text, html } = req.body;

  // Validate required fields
  if (!to || !subject) {
    return res.status(400).json({ error: 'Missing required fields: to, subject' });
  }

  // Check API key
  const apiKey = process.env.RESEND_API_KEY;
  
  console.log('🔍 Resend config check:', {
    hasApiKey: !!apiKey,
    keyPrefix: apiKey?.substring(0, 5)
  });

  if (!apiKey) {
    console.error('❌ Resend API key not configured');
    return res.status(500).json({ 
      success: false, 
      error: 'Email service not configured - missing RESEND_API_KEY' 
    });
  }

  console.log('📧 Sending email via Resend:', { to, subject });

  try {
    // Initialize Resend inside handler
    const resend = new Resend(apiKey);
    
    const data = await resend.emails.send({
      from: 'Haul Monitor <notifications@haulmonitor.com>', // Change to your verified domain
      to: [to],
      subject: subject,
      text: text || '',
      html: html || text || '',
    });

    console.log('✅ Email sent successfully:', data.id);
    return res.status(200).json({ 
      success: true, 
      messageId: data.id 
    });

  } catch (error) {
    console.error('❌ Email error:', {
      message: error.message,
      statusCode: error.statusCode,
      name: error.name
    });
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
