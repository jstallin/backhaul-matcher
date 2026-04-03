/**
 * /api/orgs/[action]
 *
 * All org management operations in one Vercel function.
 *
 *   GET  /api/orgs/me            — get (or auto-create) user's org + membership
 *   POST /api/orgs/invite        — send invite email (org admin only)
 *   GET  /api/orgs/invite-token  — validate invite token, return org/inviter info
 *   POST /api/orgs/respond       — accept or decline an invite (auth required)
 *   GET  /api/orgs/members       — list org members (org admin only)
 *   DELETE /api/orgs/members     — remove a member (org admin only)
 *   POST /api/orgs/role          — promote/demote member role (app admin only)
 *   GET  /api/orgs/all           — list all orgs with member counts (app admin only)
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.VITE_APP_URL || 'https://app.haulmonitor.cloud';

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'pm.me',
  'ymail.com', 'msn.com', 'googlemail.com'
]);

function getEmailDomain(email) {
  return email?.split('@')[1]?.toLowerCase() || '';
}

function isEnterpriseDomain(domain) {
  return domain && !FREE_EMAIL_DOMAINS.has(domain);
}

async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.error('RESEND_API_KEY not set'); return; }
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: 'Haul Monitor <notifications@haulmonitor.cloud>',
    to: [to],
    subject,
    html,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { action } = req.query;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // invite-token validation is auth-optional (need to show invite details before login)
  if (action === 'invite-token' && req.method === 'GET') {
    return handleInviteToken(req, res, supabase);
  }

  // All other routes require authentication
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (authError || !user) return res.status(401).json({ error: 'Invalid authentication token' });

  switch (action) {
    case 'me':      return handleMe(req, res, supabase, user);
    case 'invite':  return handleInvite(req, res, supabase, user);
    case 'respond': return handleRespond(req, res, supabase, user);
    case 'members': return handleMembers(req, res, supabase, user);
    case 'role':    return handleRole(req, res, supabase, user);
    case 'all':     return handleAll(req, res, supabase, user);
    default:
      return res.status(404).json({ error: `Unknown action: ${action}` });
  }
}

// ── GET /api/orgs/me ──────────────────────────────────────────────────────────
// Returns user's org + role. Auto-creates org for first enterprise-domain user.

async function handleMe(req, res, supabase, user) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Check existing membership
    const { data: membership } = await supabase
      .from('org_memberships')
      .select('role, orgs(*)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (membership) {
      return res.status(200).json({
        org: membership.orgs,
        role: membership.role,
        is_org_admin: membership.role === 'admin'
      });
    }

    // No membership — check if enterprise domain
    const domain = getEmailDomain(user.email);
    if (!isEnterpriseDomain(domain)) {
      return res.status(200).json({ org: null, role: null, is_org_admin: false });
    }

    // Find or create org for this domain
    let { data: org } = await supabase
      .from('orgs')
      .select('*')
      .eq('email_domain', domain)
      .maybeSingle();

    let role = 'member';

    if (!org) {
      // First user with this domain — create the org and make them admin
      const { data: newOrg, error: createErr } = await supabase
        .from('orgs')
        .insert({ name: domain, email_domain: domain })
        .select()
        .single();

      if (createErr) throw createErr;
      org = newOrg;
      role = 'admin';
    }

    // Add membership
    const { error: memberErr } = await supabase
      .from('org_memberships')
      .insert({ org_id: org.id, user_id: user.id, role });

    if (memberErr) throw memberErr;

    console.log(`✅ Org ${role === 'admin' ? 'created' : 'joined'}: ${org.name} for user ${user.id}`);
    return res.status(200).json({ org, role, is_org_admin: role === 'admin' });
  } catch (err) {
    console.error('Error in handleMe:', err);
    return res.status(500).json({ error: 'Failed to load org' });
  }
}

// ── POST /api/orgs/invite ─────────────────────────────────────────────────────

async function handleInvite(req, res, supabase, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify caller is org admin
  const { data: callerMembership } = await supabase
    .from('org_memberships')
    .select('role, org_id, orgs(name)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!callerMembership || callerMembership.role !== 'admin') {
    return res.status(403).json({ error: 'Only org admins can send invites' });
  }

  const { email } = req.body || {};
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' });

  const inviteeEmail = email.toLowerCase().trim();
  const orgId = callerMembership.org_id;
  const orgName = callerMembership.orgs?.name || 'your organization';

  // Check for existing active invite
  const { data: existingInvite } = await supabase
    .from('org_invites')
    .select('id, status')
    .eq('org_id', orgId)
    .eq('email', inviteeEmail)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingInvite) {
    return res.status(400).json({ error: 'A pending invite already exists for this email' });
  }

  // Check if already a member
  const { data: existingMember } = await supabase
    .from('org_memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .maybeSingle();

  // Check if email belongs to an existing Haul Monitor user
  const { data: { users: allUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existingUser = allUsers?.find(u => u.email?.toLowerCase() === inviteeEmail);
  const isNewUser = !existingUser;

  // Create invite record
  const { data: invite, error: inviteErr } = await supabase
    .from('org_invites')
    .insert({
      org_id: orgId,
      invited_by: user.id,
      email: inviteeEmail,
      is_new_user: isNewUser
    })
    .select()
    .single();

  if (inviteErr) {
    console.error('Failed to create invite:', inviteErr);
    return res.status(500).json({ error: 'Failed to create invite' });
  }

  const inviteUrl = `${APP_URL}/accept-invite?token=${invite.token}`;
  const inviterName = user.user_metadata?.full_name || user.email;

  if (isNewUser) {
    // New user — send Supabase signup invite with redirect to accept page
    try {
      await supabase.auth.admin.inviteUserByEmail(inviteeEmail, {
        redirectTo: inviteUrl,
        data: { invited_to_org: orgId, invite_token: invite.token }
      });
    } catch (err) {
      console.error('Supabase invite error:', err);
      // Fall through — still try to send the Resend email below
    }
  }

  // Send invite email via Resend
  const emailHtml = buildInviteEmailHtml({
    orgName,
    inviterName,
    inviteeEmail,
    inviteUrl,
    isNewUser,
    expiresAt: invite.expires_at
  });

  try {
    await sendEmail(
      inviteeEmail,
      `You've been invited to join ${orgName} on Haul Monitor`,
      emailHtml
    );
  } catch (err) {
    console.error('Resend email error:', err);
    // Invite was created — don't fail the request over email delivery
  }

  console.log(`✅ Invite sent to ${inviteeEmail} for org ${orgName} (new user: ${isNewUser})`);
  return res.status(200).json({
    success: true,
    message: `Invite sent to ${inviteeEmail}`,
    is_new_user: isNewUser
  });
}

// ── GET /api/orgs/invite-token ────────────────────────────────────────────────

async function handleInviteToken(req, res, supabase) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  try {
    const { data: invite, error } = await supabase
      .from('org_invites')
      .select('*, orgs(name), invited_by_profile:invited_by(email:raw_user_meta_data->full_name)')
      .eq('token', token)
      .single();

    if (error || !invite) {
      return res.status(404).json({ error: 'Invite not found or has expired' });
    }

    if (invite.status !== 'pending') {
      return res.status(200).json({
        valid: false,
        status: invite.status,
        org_name: invite.orgs?.name
      });
    }

    if (new Date(invite.expires_at) < new Date()) {
      await supabase.from('org_invites').update({ status: 'expired' }).eq('id', invite.id);
      return res.status(200).json({ valid: false, status: 'expired', org_name: invite.orgs?.name });
    }

    // Look up inviter name
    const { data: { user: inviter } } = await supabase.auth.admin.getUserById(invite.invited_by);
    const inviterName = inviter?.user_metadata?.full_name || inviter?.email || 'A team member';

    return res.status(200).json({
      valid: true,
      status: 'pending',
      org_name: invite.orgs?.name,
      org_id: invite.org_id,
      inviter_name: inviterName,
      email: invite.email,
      expires_at: invite.expires_at
    });
  } catch (err) {
    console.error('Error validating invite token:', err);
    return res.status(500).json({ error: 'Failed to validate invite' });
  }
}

// ── POST /api/orgs/respond ────────────────────────────────────────────────────

async function handleRespond(req, res, supabase, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, action } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Token is required' });
  if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: 'action must be accept or decline' });

  try {
    const { data: invite, error } = await supabase
      .from('org_invites')
      .select('*, orgs(name)')
      .eq('token', token)
      .single();

    if (error || !invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.status !== 'pending') return res.status(400).json({ error: `Invite already ${invite.status}` });
    if (new Date(invite.expires_at) < new Date()) {
      await supabase.from('org_invites').update({ status: 'expired' }).eq('id', invite.id);
      return res.status(400).json({ error: 'Invite has expired' });
    }

    // Confirm the email matches the logged-in user
    if (user.email?.toLowerCase() !== invite.email?.toLowerCase()) {
      return res.status(403).json({ error: 'This invite was sent to a different email address' });
    }

    // Update invite status
    await supabase
      .from('org_invites')
      .update({ status: action === 'accept' ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
      .eq('id', invite.id);

    if (action === 'accept') {
      // Check not already a member
      const { data: existing } = await supabase
        .from('org_memberships')
        .select('id')
        .eq('org_id', invite.org_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existing) {
        await supabase.from('org_memberships').insert({
          org_id: invite.org_id,
          user_id: user.id,
          role: 'member'
        });
      }

      console.log(`✅ User ${user.id} accepted invite to org ${invite.orgs?.name}`);
      return res.status(200).json({ success: true, action: 'accepted', org_name: invite.orgs?.name });
    }

    console.log(`ℹ️ User ${user.id} declined invite to org ${invite.orgs?.name}`);
    return res.status(200).json({ success: true, action: 'declined' });
  } catch (err) {
    console.error('Error responding to invite:', err);
    return res.status(500).json({ error: 'Failed to process response' });
  }
}

// ── GET/DELETE /api/orgs/members ──────────────────────────────────────────────

async function handleMembers(req, res, supabase, user) {
  // Verify caller is org admin
  const { data: callerMembership } = await supabase
    .from('org_memberships')
    .select('role, org_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!callerMembership || callerMembership.role !== 'admin') {
    return res.status(403).json({ error: 'Only org admins can manage members' });
  }

  const orgId = callerMembership.org_id;

  if (req.method === 'GET') {
    try {
      const { data: members, error } = await supabase
        .from('org_memberships')
        .select('id, role, created_at, user_id')
        .eq('org_id', orgId)
        .order('created_at');

      if (error) throw error;

      // Enrich with user details from auth
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const enriched = members.map(m => {
        const authUser = users?.find(u => u.id === m.user_id);
        return {
          ...m,
          email: authUser?.email || '—',
          full_name: authUser?.user_metadata?.full_name || null,
          last_sign_in: authUser?.last_sign_in_at || null
        };
      });

      return res.status(200).json({ members: enriched });
    } catch (err) {
      console.error('Error fetching members:', err);
      return res.status(500).json({ error: 'Failed to fetch members' });
    }
  }

  if (req.method === 'DELETE') {
    const { userId: targetUserId } = req.body || {};
    if (!targetUserId) return res.status(400).json({ error: 'userId is required' });
    if (targetUserId === user.id) return res.status(400).json({ error: 'Cannot remove yourself' });

    try {
      await supabase
        .from('org_memberships')
        .delete()
        .eq('org_id', orgId)
        .eq('user_id', targetUserId);

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to remove member' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── POST /api/orgs/role ───────────────────────────────────────────────────────
// App admin only: promote or demote a member's role

async function handleRole(req, res, supabase, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify app admin
  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!adminRow) return res.status(403).json({ error: 'App admin access required' });

  const { userId: targetUserId, orgId, role } = req.body || {};
  if (!targetUserId || !orgId || !role) return res.status(400).json({ error: 'userId, orgId, and role are required' });
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'role must be admin or member' });

  try {
    const { error } = await supabase
      .from('org_memberships')
      .update({ role })
      .eq('user_id', targetUserId)
      .eq('org_id', orgId);

    if (error) throw error;
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error updating role:', err);
    return res.status(500).json({ error: 'Failed to update role' });
  }
}

// ── GET /api/orgs/all ─────────────────────────────────────────────────────────
// App admin only: list all orgs with member counts

async function handleAll(req, res, supabase, user) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!adminRow) return res.status(403).json({ error: 'App admin access required' });

  try {
    const { data: orgs, error } = await supabase
      .from('orgs')
      .select('*, org_memberships(id, role, user_id)')
      .order('created_at');

    if (error) throw error;

    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });

    const enriched = orgs.map(org => {
      const members = (org.org_memberships || []).map(m => {
        const authUser = users?.find(u => u.id === m.user_id);
        return {
          user_id: m.user_id,
          role: m.role,
          email: authUser?.email || '—',
          full_name: authUser?.user_metadata?.full_name || null
        };
      });
      return {
        id: org.id,
        name: org.name,
        email_domain: org.email_domain,
        created_at: org.created_at,
        member_count: members.length,
        members
      };
    });

    return res.status(200).json({ orgs: enriched });
  } catch (err) {
    console.error('Error fetching all orgs:', err);
    return res.status(500).json({ error: 'Failed to fetch orgs' });
  }
}

// ── Email template ────────────────────────────────────────────────────────────

function buildInviteEmailHtml({ orgName, inviterName, inviteeEmail, inviteUrl, isNewUser, expiresAt }) {
  const expiry = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '7 days from now';

  const accountNote = isNewUser
    ? `<p style="color:#6b7280;font-size:14px;">You'll be asked to create a Haul Monitor account when you click the link below.</p>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#161b22;border:1px solid #30363d;border-radius:12px;overflow:hidden;">
    <div style="padding:28px 32px;border-bottom:1px solid #30363d;">
      <div style="font-size:20px;font-weight:800;color:#c9d1d9;letter-spacing:-0.3px;">
        <span style="color:#f0c040;">Haul</span> Monitor
      </div>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 12px 0;font-size:22px;font-weight:700;color:#c9d1d9;">
        You've been invited to join ${orgName}
      </h2>
      <p style="color:#8b949e;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
        <strong style="color:#c9d1d9;">${inviterName}</strong> has invited you to join
        <strong style="color:#c9d1d9;">${orgName}</strong> on Haul Monitor — the backhaul
        matching platform for truck fleet operators.
      </p>
      ${accountNote}
      <a href="${inviteUrl}"
         style="display:inline-block;padding:14px 28px;background:#f0c040;color:#0d1117;font-weight:700;font-size:15px;border-radius:8px;text-decoration:none;margin-bottom:24px;">
        Accept Invitation
      </a>
      <p style="color:#6b7280;font-size:13px;margin:0 0 8px 0;">
        Or copy this link into your browser:<br>
        <span style="color:#8b949e;word-break:break-all;">${inviteUrl}</span>
      </p>
      <p style="color:#6b7280;font-size:12px;margin:16px 0 0 0;padding-top:16px;border-top:1px solid #30363d;">
        This invite expires ${expiry}. If you didn't expect this email, you can safely ignore it.
        The invite was sent to ${inviteeEmail}.
      </p>
    </div>
  </div>
</body>
</html>`;
}
