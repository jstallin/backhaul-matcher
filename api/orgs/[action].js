/**
 * /api/orgs/[action]
 *
 * All org management operations in one Vercel function.
 *
 *   GET  /api/orgs/me            — get (or auto-create) user's org + membership
 *   POST /api/orgs/invite        — send invite email (org admin only)
 *   GET  /api/orgs/invite-token  — validate invite token, return org/inviter info
 *   POST /api/orgs/respond       — accept or decline an invite (auth required)
 *   GET  /api/orgs/members       — list org members (any org member)
 *   DELETE /api/orgs/members     — remove a member (org admin only)
 *   POST /api/orgs/role          — promote/demote member role (app admin only)
 *   GET  /api/orgs/all           — list all orgs with member counts (app admin only)
 *   GET  /api/orgs/admin-settings — get admin key/value settings (app admin only)
 *   POST /api/orgs/admin-settings — upsert a setting { key, value } (app admin only)
 *   GET  /api/orgs/activity      — per-org/per-user activity & revenue rollups (app admin only, #85)
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.VITE_APP_URL || 'https://haulmonitor.cloud';

// Protected E2E test account(s): authenticated Playwright CI logs in as this user
// (GitHub secrets TEST_EMAIL/TEST_PASSWORD point at it). Deleting/banning it breaks
// the authenticated suite on every main merge — it already happened once (Jun 2026).
// Keep this in sync with the TEST_EMAIL secret. Surfaced to the admin UI as
// is_test_account and hard-blocked in the ban/delete handler.
const PROTECTED_TEST_EMAILS = new Set(['lajopo4996@mugstock.com']);
const isProtectedTestEmail = (email) => PROTECTED_TEST_EMAILS.has((email || '').toLowerCase());

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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
    case 'role':            return handleRole(req, res, supabase, user);
    case 'all':             return handleAll(req, res, supabase, user);
    case 'users':           return handleUsers(req, res, supabase, user);
    case 'user-action':     return handleUserAction(req, res, supabase, user);
    case 'pilot':           return handlePilot(req, res, supabase, user);
    case 'admin-settings':    return handleAdminSettings(req, res, supabase, user);
    case 'activity':          return handleActivity(req, res, supabase, user);
    case 'trimble-actuals':   return handleTrimbleActuals(req, res, supabase, user);
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
      .select('*, orgs(name)')
      .eq('token', token)
      .single();

    if (error || !invite) {
      console.error('invite-token lookup failed:', error?.message, '| token:', token);
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
      expires_at: invite.expires_at,
      is_new_user: invite.is_new_user
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
  const { data: callerMembership } = await supabase
    .from('org_memberships')
    .select('role, org_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!callerMembership) {
    return res.status(403).json({ error: 'You are not a member of any organization' });
  }

  const orgId = callerMembership.org_id;

  if (req.method === 'GET') {
    // Viewing the member roster is open to any org member (read-only team list,
    // shown in v2 Settings). Removing a member is admin-only (DELETE below). (#91)
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
    if (callerMembership.role !== 'admin') {
      return res.status(403).json({ error: 'Only org admins can remove members' });
    }
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
        is_pilot: org.is_pilot || false,
        pilot_start_date: org.pilot_start_date || null,
        pilot_end_date: org.pilot_end_date || null,
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

// ── POST /api/orgs/pilot ──────────────────────────────────────────────────────
// App admin only: set or clear the pilot flag on an org

async function handlePilot(req, res, supabase, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!adminRow) return res.status(403).json({ error: 'App admin access required' });

  const { org_id, is_pilot, pilot_start_date, pilot_end_date } = req.body || {};
  if (!org_id || typeof is_pilot !== 'boolean') {
    return res.status(400).json({ error: 'org_id and is_pilot (boolean) are required' });
  }

  // Validate dates if provided
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (pilot_start_date && !dateRegex.test(pilot_start_date)) {
    return res.status(400).json({ error: 'pilot_start_date must be YYYY-MM-DD' });
  }
  if (pilot_end_date && !dateRegex.test(pilot_end_date)) {
    return res.status(400).json({ error: 'pilot_end_date must be YYYY-MM-DD' });
  }

  const updates = {
    is_pilot,
    // When removing pilot status, clear the dates. Otherwise set whatever was passed (null clears).
    pilot_start_date: is_pilot ? (pilot_start_date || null) : null,
    pilot_end_date:   is_pilot ? (pilot_end_date   || null) : null,
  };

  const { error } = await supabase
    .from('orgs')
    .update(updates)
    .eq('id', org_id);

  if (error) {
    console.error('Error updating pilot status:', error);
    return res.status(500).json({ error: 'Failed to update pilot status' });
  }

  console.log(`Org ${org_id} pilot=${is_pilot} (${pilot_start_date || 'no start'} → ${pilot_end_date || 'no end'}) set by admin ${user.id}`);
  return res.status(200).json({ success: true, org_id, is_pilot, pilot_start_date: updates.pilot_start_date, pilot_end_date: updates.pilot_end_date });
}

// ── GET/POST /api/orgs/admin-settings ────────────────────────────────────────
// App admin only: read or upsert key/value admin settings

async function handleAdminSettings(req, res, supabase, user) {
  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!adminRow) return res.status(403).json({ error: 'App admin access required' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('key, value, updated_at')
      .order('key');

    if (error) return res.status(500).json({ error: 'Failed to load settings' });
    return res.status(200).json({ settings: data || [] });
  }

  if (req.method === 'POST') {
    const { key, value } = req.body || {};
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key and value are required' });
    }

    const { data, error } = await supabase
      .from('admin_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to save setting' });
    console.log(`[admin] setting updated: ${key} =`, JSON.stringify(value), `by ${user.email}`);
    return res.status(200).json({ setting: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── GET /api/orgs/trimble-actuals?month=YYYY-MM ──────────────────────────────
// ── PATCH /api/orgs/trimble-actuals  { id, excluded_from_billing } ────────────
// App admin only.

async function handleTrimbleActuals(req, res, supabase, user) {
  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!adminRow) return res.status(403).json({ error: 'App admin access required' });

  // PATCH — toggle excluded_from_billing on a single record
  if (req.method === 'PATCH') {
    const { id, excluded_from_billing, type } = req.body || {};
    if (!id || typeof excluded_from_billing !== 'boolean') {
      return res.status(400).json({ error: 'id and excluded_from_billing required' });
    }
    // WWP row IDs are composite strings like "uuid_outbound" — extract the plan UUID
    const table = type === 'wwp' ? 'work_week_plans' : 'backhaul_requests';
    const planId = type === 'wwp' ? id.replace(/_outbound$|_return$/, '') : id;
    const { error } = await supabase
      .from(table)
      .update({ excluded_from_billing })
      .eq('id', planId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const monthParam = req.query.month;
  let start;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    start = new Date(`${monthParam}-01T00:00:00.000Z`);
  } else {
    const now = new Date();
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

  const [{ data: loads, error }, { data: wwpRows, error: wwpError }] = await Promise.all([
    supabase
      .from('backhaul_requests')
      .select(`
        id,
        request_name,
        datum_point,
        completed_at,
        hauled_load_id,
        hauled_load_source,
        revenue_amount,
        net_revenue,
        excluded_from_billing,
        fleets ( name )
      `)
      .eq('status', 'completed')
      .gte('completed_at', start.toISOString())
      .lt('completed_at', end.toISOString())
      .order('completed_at', { ascending: true }),
    supabase
      .from('work_week_plans')
      .select('id, fleet_id, outbound_load, return_load, outbound_status, return_status, excluded_from_billing, updated_at, fleets ( name )')
      .or('outbound_status.eq.hauled,return_status.eq.hauled')
      .gte('updated_at', start.toISOString())
      .lt('updated_at', end.toISOString())
      .order('updated_at', { ascending: true }),
  ]);

  if (error) {
    console.error('[trimble-actuals] backhaul query error:', error.message);
    return res.status(500).json({ error: 'Failed to query loads' });
  }
  if (wwpError) {
    console.error('[trimble-actuals] wwp query error:', wwpError.message);
  }

  const mapped = loads.map(r => ({
    id: r.id,
    type: 'backhaul',
    completed_at: r.completed_at,
    request_name: r.request_name || null,
    datum_point: r.datum_point || null,
    fleet_name: r.fleets?.name || null,
    load_id: r.hauled_load_id || null,
    source: r.hauled_load_source || null,
    revenue_amount: r.revenue_amount ? parseFloat(r.revenue_amount) : null,
    net_revenue: r.net_revenue ? parseFloat(r.net_revenue) : null,
    excluded_from_billing: r.excluded_from_billing ?? false,
  }));

  // Expand each WWP plan into individual hauled load rows
  const wwpMapped = [];
  for (const plan of (wwpRows || [])) {
    const planExcluded = plan.excluded_from_billing ?? false;
    if (plan.outbound_status === 'hauled' && plan.outbound_load) {
      const load = plan.outbound_load;
      wwpMapped.push({
        id: `${plan.id}_outbound`,
        type: 'wwp',
        completed_at: plan.updated_at,
        request_name: 'Work Week Plan — Outbound',
        datum_point: load.pickup_city && load.pickup_state ? `${load.pickup_city}, ${load.pickup_state}` : null,
        fleet_name: plan.fleets?.name || null,
        load_id: load.load_id || null,
        source: load.source || null,
        revenue_amount: load.total_revenue ? parseFloat(load.total_revenue) : null,
        net_revenue: load.net_revenue != null ? parseFloat(load.net_revenue) : (load.carrier_revenue != null ? parseFloat(load.carrier_revenue) : null),
        excluded_from_billing: planExcluded,
      });
    }
    if (plan.return_status === 'hauled' && plan.return_load) {
      const load = plan.return_load;
      wwpMapped.push({
        id: `${plan.id}_return`,
        type: 'wwp',
        completed_at: plan.updated_at,
        request_name: 'Work Week Plan — Return',
        datum_point: load.pickup_city && load.pickup_state ? `${load.pickup_city}, ${load.pickup_state}` : null,
        fleet_name: plan.fleets?.name || null,
        load_id: load.load_id || null,
        source: load.source || null,
        revenue_amount: load.total_revenue ? parseFloat(load.total_revenue) : null,
        net_revenue: load.net_revenue != null ? parseFloat(load.net_revenue) : (load.carrier_revenue != null ? parseFloat(load.carrier_revenue) : null),
        excluded_from_billing: planExcluded,
      });
    }
  }

  const allLoads = [...mapped, ...wwpMapped].sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
  const billableCount = allLoads.filter(r => !r.excluded_from_billing).length;

  return res.status(200).json({
    month: start.toISOString().slice(0, 7),
    count: billableCount,
    loads: allLoads,
  });
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

// ── GET /api/orgs/users ───────────────────────────────────────────────────────
// App admin only: list ALL users (incl. org-less / personal-domain), for review +
// the ban/delete controls (#49/#50). The org-centric views don't surface org-less
// users at all, so this is how an admin even sees a registrant like the intern.

async function handleUsers(req, res, supabase, user) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { data: adminRow } = await supabase
    .from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!adminRow) return res.status(403).json({ error: 'App admin access required' });

  try {
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });

    const { data: memberships } = await supabase
      .from('org_memberships').select('user_id, role, orgs(name)');
    const byUser = {};
    (memberships || []).forEach(m => { byUser[m.user_id] = { org: m.orgs?.name || null, role: m.role }; });

    const { data: admins } = await supabase.from('admin_users').select('user_id');
    const adminIds = new Set((admins || []).map(a => a.user_id));

    const result = (users || []).map(u => {
      const mem = byUser[u.id];
      return {
        id: u.id,
        email: u.email,
        full_name: u.user_metadata?.full_name || null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null,
        banned: !!u.banned_until && new Date(u.banned_until) > new Date(),
        personal_domain: !isEnterpriseDomain(getEmailDomain(u.email)),
        org: mem?.org || null,
        org_role: mem?.role || null,
        is_app_admin: adminIds.has(u.id),
        is_test_account: isProtectedTestEmail(u.email),
      };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.status(200).json({ users: result });
  } catch (err) {
    console.error('Error in handleUsers:', err);
    return res.status(500).json({ error: 'Failed to list users' });
  }
}

// ── POST /api/orgs/user-action ────────────────────────────────────────────────
// App admin only: ban / unban / delete a user (#49). Ban blocks login (right tool
// for a suspected competitor — no access, not a browse-only lockout).

async function handleUserAction(req, res, supabase, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { data: adminRow } = await supabase
    .from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!adminRow) return res.status(403).json({ error: 'App admin access required' });

  const { userId, op } = req.body || {};
  if (!userId || !['ban', 'unban', 'delete'].includes(op)) {
    return res.status(400).json({ error: 'userId and op (ban|unban|delete) are required' });
  }
  if (userId === user.id) return res.status(400).json({ error: 'You cannot perform this action on your own account' });

  // Safety: never ban/delete another app admin.
  const { data: targetAdmin } = await supabase
    .from('admin_users').select('user_id').eq('user_id', userId).maybeSingle();
  if (targetAdmin) return res.status(400).json({ error: 'Cannot modify another app admin' });

  // Safety: never ban/delete the protected E2E test account — CI auth depends on it.
  if (op === 'ban' || op === 'delete') {
    const { data: target } = await supabase.auth.admin.getUserById(userId);
    if (isProtectedTestEmail(target?.user?.email)) {
      return res.status(400).json({ error: 'This is the protected E2E test account used by CI auth. Remove it from PROTECTED_TEST_EMAILS first if you really mean to.' });
    }
  }

  try {
    if (op === 'delete') {
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) throw error;
    } else {
      const ban_duration = op === 'ban' ? '876000h' : 'none'; // ~100 years / lift
      const { error } = await supabase.auth.admin.updateUserById(userId, { ban_duration });
      if (error) throw error;
    }
    return res.status(200).json({ success: true, op });
  } catch (err) {
    console.error('Error in handleUserAction:', err);
    return res.status(500).json({ error: err.message || 'User action failed' });
  }
}

// ── GET /api/orgs/activity ────────────────────────────────────────────────────
// App admin only (#85): per-org, per-user activity recency + revenue rollups for
// the Admin Dashboard "Org Activity" panel. Revenue shown all-time AND last 30
// days. Cross-user reads happen here with the service role — never client-side.

async function handleActivity(req, res, supabase, user) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!adminRow) return res.status(403).json({ error: 'App admin access required' });

  try {
    const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: orgs, error: orgsError }, { data: { users } }, { data: requests, error: reqError }, { data: events, error: evError }, { data: creditUsage, error: cuError }] = await Promise.all([
      supabase.from('orgs').select('id, name, email_domain, is_pilot, org_memberships(user_id, role)').order('created_at'),
      supabase.auth.admin.listUsers({ perPage: 1000 }),
      supabase.from('backhaul_requests').select(
        'user_id, created_at, updated_at, status, net_revenue, completed_at, cancellation_reason, cancelled_at, declined_top_gross_revenue, declined_top_customer_net, declined_top_carrier_net'
      ),
      // Latest-first; 5000 covers pilot scale for months (index on user/type/created).
      // If this ever truncates, "last X" stays correct for active users — only very
      // stale users could under-report, which the panel exists to surface anyway.
      supabase.from('user_activity_events').select('user_id, event_type, created_at').order('created_at', { ascending: false }).limit(5000),
      // #131: per-user billable credit spend (summed in SQL), for the revenue projection.
      supabase.rpc('get_credit_usage_by_user', { p_cutoff: cutoff30d }),
    ]);

    if (orgsError) throw orgsError;
    if (reqError) throw reqError;
    if (evError) throw evError;
    if (cuError) throw cuError;

    // Per-user reductions
    const byUser = {};
    const u = (id) => (byUser[id] ||= {
      last_request_created: null, last_request_updated: null,
      last_search_run: null, last_detail_open: null,
      hauled_all: 0, hauled_30d: 0, completed_count: 0,
      declined_gross_all: 0, declined_customer_all: 0, declined_carrier_all: 0,
      declined_gross_30d: 0, declined_customer_30d: 0, declined_carrier_30d: 0,
      declined_count: 0,
      credits_all: 0, credits_30d: 0, credit_actions_all: 0, credit_actions_30d: 0, // #131
    });
    const maxTs = (a, b) => (!a || (b && b > a)) ? b : a;

    for (const r of requests || []) {
      const row = u(r.user_id);
      row.last_request_created = maxTs(row.last_request_created, r.created_at);
      row.last_request_updated = maxTs(row.last_request_updated, r.updated_at);
      if (r.status === 'completed') {
        const net = Number(r.net_revenue) || 0;
        row.hauled_all += net;
        row.completed_count += 1;
        if (r.completed_at && r.completed_at >= cutoff30d) row.hauled_30d += net;
      }
      if (r.cancellation_reason === 'operations_declined' && r.declined_top_gross_revenue != null) {
        const gross = Number(r.declined_top_gross_revenue) || 0;
        const cust = Number(r.declined_top_customer_net) || 0;
        const carr = Number(r.declined_top_carrier_net) || 0;
        row.declined_gross_all += gross; row.declined_customer_all += cust; row.declined_carrier_all += carr;
        row.declined_count += 1;
        if (r.cancelled_at && r.cancelled_at >= cutoff30d) {
          row.declined_gross_30d += gross; row.declined_customer_30d += cust; row.declined_carrier_30d += carr;
        }
      }
    }

    for (const e of events || []) {
      const row = u(e.user_id);
      if (e.event_type === 'search_run') row.last_search_run = maxTs(row.last_search_run, e.created_at);
      if (e.event_type === 'load_detail_open') row.last_detail_open = maxTs(row.last_detail_open, e.created_at);
    }

    // #131: billable credit spend per user (from the SQL aggregate).
    for (const c of creditUsage || []) {
      const row = u(c.user_id);
      row.credits_all = Number(c.credits_all) || 0;
      row.credits_30d = Number(c.credits_30d) || 0;
      row.credit_actions_all = Number(c.count_all) || 0;
      row.credit_actions_30d = Number(c.count_30d) || 0;
    }

    // Assemble per-org
    const result = (orgs || []).map((org) => {
      const members = (org.org_memberships || []).map((m) => {
        const authUser = users?.find((au) => au.id === m.user_id);
        const stats = byUser[m.user_id] || u(`__empty_${m.user_id}`);
        return {
          user_id: m.user_id,
          role: m.role,
          email: authUser?.email || '—',
          full_name: authUser?.user_metadata?.full_name || null,
          last_sign_in_at: authUser?.last_sign_in_at || null,
          last_request_created: stats.last_request_created,
          last_request_updated: stats.last_request_updated,
          last_search_run: stats.last_search_run,
          last_detail_open: stats.last_detail_open,
          hauled_all: stats.hauled_all,
          hauled_30d: stats.hauled_30d,
          completed_count: stats.completed_count,
          credits_all: stats.credits_all,           // #131
          credits_30d: stats.credits_30d,
          credit_actions_all: stats.credit_actions_all,
          credit_actions_30d: stats.credit_actions_30d,
        };
      });

      const sum = (fn) => members.reduce((s, m) => s + (byUser[m.user_id] ? fn(byUser[m.user_id]) : 0), 0);
      return {
        id: org.id,
        name: org.name,
        email_domain: org.email_domain,
        is_pilot: org.is_pilot || false,
        member_count: members.length,
        rollup: {
          hauled_all: sum((s) => s.hauled_all),
          hauled_30d: sum((s) => s.hauled_30d),
          completed_count: sum((s) => s.completed_count),
          declined_gross_all: sum((s) => s.declined_gross_all),
          declined_customer_all: sum((s) => s.declined_customer_all),
          declined_carrier_all: sum((s) => s.declined_carrier_all),
          declined_gross_30d: sum((s) => s.declined_gross_30d),
          declined_customer_30d: sum((s) => s.declined_customer_30d),
          declined_carrier_30d: sum((s) => s.declined_carrier_30d),
          declined_count: sum((s) => s.declined_count),
          credits_all: sum((s) => s.credits_all),               // #131
          credits_30d: sum((s) => s.credits_30d),
          credit_actions_all: sum((s) => s.credit_actions_all),
          credit_actions_30d: sum((s) => s.credit_actions_30d),
          last_sign_in_at: members.reduce((a, m) => (!a || (m.last_sign_in_at && m.last_sign_in_at > a)) ? m.last_sign_in_at : a, null),
        },
        members,
      };
    });

    return res.status(200).json({ orgs: result });
  } catch (err) {
    console.error('Error in handleActivity:', err);
    return res.status(500).json({ error: 'Failed to fetch org activity' });
  }
}
