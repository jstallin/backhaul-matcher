import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TS_EMAIL      = process.env.TRUCKSTOP_INTEGRATION_CONTACT_EMAIL;
const SUPPORT_EMAIL = 'support@haulmonitor.cloud';
const FROM_EMAIL    = 'notifications@haulmonitor.cloud';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.slice(7);

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  // Require org membership
  const { data: membership } = await supabase
    .from('org_memberships')
    .select('role, org_id, orgs(id, name, ts_onboarding_complete)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership?.org_id) {
    return res.status(400).json({ error: 'No organization found for this user' });
  }

  const orgId   = membership.org_id;
  const orgName = membership.orgs?.name || 'Unknown Organization';
  const isAdmin = membership.role === 'admin';

  const { action, integration_id } = req.body || {};

  if (!action) return res.status(400).json({ error: 'action is required' });

  const markComplete = async () => {
    await supabase.from('orgs').update({ ts_onboarding_complete: true }).eq('id', orgId);
  };

  // ── save_id: org admin provides their integration ID ─────────────────────────
  if (action === 'save_id') {
    if (!isAdmin) return res.status(403).json({ error: 'Only org admins can save the integration ID' });
    if (!integration_id?.trim()) return res.status(400).json({ error: 'integration_id is required' });

    const { error: rpcError } = await supabase.rpc('store_ts_integration_id', {
      p_org_id: orgId,
      p_integration_id: integration_id.trim(),
    });

    if (rpcError) {
      console.error('store_ts_integration_id error:', rpcError);
      return res.status(500).json({ error: 'Failed to save integration ID' });
    }

    await markComplete();
    console.log(`✅ Truckstop integration ID saved for org ${orgId}`);
    return res.status(200).json({ success: true });
  }

  // ── no_id: existing customer, doesn't have integration ID yet ─────────────────
  if (action === 'no_id') {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && TS_EMAIL) {
      try {
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: FROM_EMAIL,
          to: TS_EMAIL,
          cc: SUPPORT_EMAIL,
          reply_to: user.email,
          subject: `Haul Monitor Integration Request – ${orgName}`,
          text: `Hello Team,\n\n${orgName} would like to connect with Haul Monitor. Can you please verify whether they have the required licenses enabled for the integration and provide the Integration ID if available?\n\nThank you,\nHaul Monitor Team`,
        });
        console.log(`📧 Truckstop integration request email sent for org ${orgId}`);
      } catch (emailErr) {
        console.error('Failed to send Truckstop no_id email:', emailErr);
        // Non-fatal — still mark complete
      }
    }

    await markComplete();
    return res.status(200).json({ success: true, email_sent: true });
  }

  // ── not_customer: not yet a Truckstop subscriber ─────────────────────────────
  if (action === 'not_customer') {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && TS_EMAIL) {
      try {
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: FROM_EMAIL,
          to: TS_EMAIL,
          cc: SUPPORT_EMAIL,
          reply_to: user.email,
          subject: `Haul Monitor Account Inquiry – ${orgName}`,
          text: `Hello Team,\n\n${orgName} is interested in a Truckstop account as part of registering with Haul Monitor. Can you please have the sales team contact them at this email address?\n\nThank you,\nHaul Monitor Team`,
        });
        console.log(`📧 Truckstop account inquiry email sent for org ${orgId}`);
      } catch (emailErr) {
        console.error('Failed to send Truckstop not_customer email:', emailErr);
      }
    }

    await markComplete();
    return res.status(200).json({ success: true, email_sent: true });
  }

  // ── skip: user opts to do this later ─────────────────────────────────────────
  if (action === 'skip') {
    await markComplete();
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
