/**
 * Share a load from the detail view (#82): Email / Text / Copy.
 *
 * POST body: {
 *   channel: 'email' | 'text' | 'copy',
 *   recipient,            // email address | E.164 +1XXXXXXXXXX | null for copy
 *   subject,              // email only
 *   text,                 // sms message / email plain-text fallback
 *   html,                 // email only — may reference <img src="cid:routemap">
 *   stops,                // email only — [{address:'City, ST', lat, lng}] for the static route map
 *   loadId, loadSource,   // share tracking
 * }
 *
 * Email sends via Resend with reply_to = the logged-in user (from stays the
 * verified domain for SPF/DKIM); the route map is a PC*MILER mapRoutes static
 * image attached inline (cid). SMS sends via Twilio. Copy only logs.
 * Every share is recorded in load_shares (user_id from the verified JWT).
 */
import twilio from 'twilio';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { brandSms } from '../../src/utils/smsBody.js';

// Same auth posture as api/notifications (#57): sends spend our Resend/Twilio
// accounts, so require a valid Supabase session JWT + CORS-restrict to our origins.
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const US_E164_RE = /^\+1\d{10}$/;
const SMS_MAX = 1600;       // Twilio hard limit; the client caps the note at 300
const HTML_MAX = 200_000;   // sanity cap on email body size

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Static route map via PC*MILER mapRoutes (same Service.svc API the other proxies
// use). Returns a base64 PNG, or null on any failure — the email then goes out
// without the map rather than failing the share.
async function fetchRouteMap(stops) {
  const token = process.env.PCMILER_API_KEY;
  if (!token || !Array.isArray(stops) || stops.length < 2) return null;

  const Stops = stops.slice(0, 5).map((s) => {
    const [city = '', state = ''] = String(s.address || '').split(',').map((p) => p.trim());
    return {
      Address: { City: city, State: state },
      // Coords take precedence when the load source provided them; Truckstop SOAP
      // loads have null coords and PC*MILER geocodes the city/state instead.
      Coords: s.lat != null && s.lng != null ? { Lat: String(s.lat), Lon: String(s.lng) } : null,
      Region: 4, // North America
      IsViaPoint: false,
    };
  });

  const body = {
    Map: {
      Viewport: { Center: null, ScreenCenter: null, ZoomRadius: 0, CornerA: null, CornerB: null, Region: 4 },
      Projection: 0,
      Style: 0,
      ImageOption: 0,
      Width: 600,
      Height: 400,
      Drawers: [8, 2, 7, 17, 15],
      MapLayering: 0,
    },
    Routes: [{
      RouteId: null,
      Stops,
      Options: { HighwayOnly: true, DistanceUnits: 0, RoutingType: 0, VehicleType: 0 },
      DrawLeastCost: false,
      StopLabelDrawer: 1,
    }],
  };

  try {
    const r = await fetch(
      `https://pcmiler.alk.com/apis/rest/v1.0/Service.svc/mapRoutes?authToken=${token}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!r.ok) {
      console.error('mapRoutes error:', r.status, (await r.text()).slice(0, 300));
      return null;
    }
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('image')) {
      return Buffer.from(await r.arrayBuffer()).toString('base64');
    }
    // Some Service.svc operations wrap the image as a JSON byte array or base64 string.
    const data = await r.json();
    if (Array.isArray(data)) return Buffer.from(data).toString('base64');
    if (typeof data === 'string') return data;
    console.error('mapRoutes unexpected response shape:', ct);
    return null;
  } catch (err) {
    console.error('mapRoutes fetch failed:', err.message);
    return null;
  }
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }

  const { channel, recipient, subject, text, html, stops, loadId, loadSource } = req.body || {};
  if (!['email', 'text', 'copy'].includes(channel)) {
    return res.status(400).json({ error: "channel must be 'email', 'text', or 'copy'" });
  }

  let messageId = null;

  if (channel === 'email') {
    if (!EMAIL_RE.test(recipient || '')) return res.status(400).json({ error: 'Invalid email address' });
    if (!subject || !html) return res.status(400).json({ error: 'Missing required fields: subject, html' });
    if (html.length > HTML_MAX) return res.status(400).json({ error: 'Email body too large' });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: 'Email service not configured' });

    const mapBase64 = await fetchRouteMap(stops);
    // The client HTML references cid:routemap — strip the img if the map failed.
    const finalHtml = mapBase64 ? html : html.replace(/<img[^>]*cid:routemap[^>]*\/?>/g, '');

    try {
      const resend = new Resend(apiKey);
      const result = await resend.emails.send({
        from: 'Haul Monitor <notifications@haulmonitor.cloud>',
        to: [recipient],
        reply_to: user.email,
        subject,
        text: text || '',
        html: finalHtml,
        ...(mapBase64 ? {
          attachments: [{
            filename: 'route-map.png',
            content: mapBase64,
            content_type: 'image/png',
            content_id: 'routemap',
          }],
        } : {}),
      });
      if (result.error) throw new Error(result.error.message || 'Resend error');
      messageId = result.data?.id || null;
    } catch (error) {
      console.error('Share email error:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (channel === 'text') {
    if (!US_E164_RE.test(recipient || '')) return res.status(400).json({ error: 'Invalid US phone number (expected +1XXXXXXXXXX)' });
    if (!text) return res.status(400).json({ error: 'Missing required field: text' });
    if (text.length > SMS_MAX) return res.status(400).json({ error: 'Message too long for SMS' });

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!accountSid || !authToken || !fromNumber) {
      return res.status(500).json({ success: false, error: 'SMS service not configured' });
    }

    try {
      const client = twilio(accountSid, authToken);
      const result = await client.messages.create({ body: brandSms(text), from: fromNumber, to: recipient }); // #140
      messageId = result.sid;
    } catch (error) {
      console.error('Share SMS error:', error.message);
      return res.status(500).json({ success: false, error: error.message, code: error.code });
    }
  }

  // channel === 'copy' sends nothing — it only logs below.

  // Track every share (#82). Service-role insert; user_id comes from the verified JWT.
  // A failed log shouldn't fail a send that already happened — log and continue.
  try {
    const { error: insertError } = await supabase.from('load_shares').insert({
      user_id: user.id,
      load_id: loadId || null,
      load_source: loadSource || null,
      channel,
      recipient: channel === 'copy' ? null : recipient,
    });
    if (insertError) console.error('load_shares insert error:', insertError.message);
  } catch (err) {
    console.error('load_shares insert failed:', err.message);
  }

  return res.status(200).json({ success: true, messageId });
}
