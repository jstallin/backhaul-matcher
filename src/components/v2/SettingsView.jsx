import { useState, useEffect } from 'react';
import { tokens } from '../../styles/tokens.v2';
import { supabase } from '../../lib/supabase';
import { db } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMobile } from '../../hooks/useMobile';

const t = tokens;

// ─── Shared primitives ────────────────────────────────────────────────────────

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: t.colors.page.cardBg,
      border: `1px solid ${t.colors.page.cardBorder}`,
      borderRadius: t.radius.xl,
      padding: '20px',
      marginBottom: '16px',
      boxShadow: t.shadow.sm,
      ...style,
    }}>
      {children}
    </div>
  );
}

function CardTitle({ children }) {
  return (
    <div style={{
      fontSize: t.font.size.base,
      fontWeight: t.font.weight.semibold,
      color: t.colors.text.primary,
      marginBottom: '12px',
    }}>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', disabled, style = {} }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '8px 10px',
        border: `1px solid ${t.colors.border.default}`,
        borderRadius: t.radius.lg,
        fontSize: t.font.size.sm,
        color: t.colors.text.primary,
        background: disabled ? '#f8fafc' : '#fff',
        outline: 'none',
        boxSizing: 'border-box',
        fontFamily: t.font.family,
        ...style,
      }}
    />
  );
}

function Field({ label, children, style = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', ...style }}>
      <label style={{
        fontSize: t.font.size.xs,
        fontWeight: t.font.weight.semibold,
        color: t.colors.text.muted,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, style = {}, type = 'button' }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: disabled ? '#e2e8f0' : hovered ? t.colors.accent.blueHover : t.colors.accent.blue,
        color: disabled ? '#94a3b8' : '#fff',
        border: 'none',
        borderRadius: t.radius.lg,
        padding: '8px 16px',
        fontSize: t.font.size.sm,
        fontWeight: t.font.weight.semibold,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'background 0.12s',
        fontFamily: t.font.family,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick, style = {}, type = 'button' }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type={type}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#f1f5f9' : 'transparent',
        color: t.colors.text.secondary,
        border: `1px solid ${t.colors.border.default}`,
        borderRadius: t.radius.lg,
        padding: '8px 14px',
        fontSize: t.font.size.sm,
        fontWeight: t.font.weight.medium,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'background 0.12s',
        fontFamily: t.font.family,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function StatusBadge({ connected }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '2px 10px',
      borderRadius: t.radius.full,
      fontSize: t.font.size.xs,
      fontWeight: t.font.weight.semibold,
      background: connected ? t.colors.accent.greenLight : '#f1f5f9',
      color: connected ? t.colors.accent.green : t.colors.text.muted,
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: connected ? t.colors.accent.green : '#cbd5e1' }} />
      {connected ? 'Connected' : 'Not connected'}
    </span>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: '36px', height: '20px',
          borderRadius: '10px',
          background: checked ? t.colors.accent.blue : '#cbd5e1',
          position: 'relative',
          flexShrink: 0,
          transition: 'background 0.15s',
          cursor: 'pointer',
        }}
      >
        <div style={{
          position: 'absolute',
          top: '2px',
          left: checked ? '18px' : '2px',
          width: '16px', height: '16px',
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.15s',
        }} />
      </div>
      {label && <span style={{ fontSize: t.font.size.sm, color: t.colors.text.secondary }}>{label}</span>}
    </label>
  );
}

function InlineAlert({ type, msg }) {
  if (!msg) return null;
  const isError = type === 'error';
  return (
    <div style={{
      padding: '8px 12px',
      borderRadius: t.radius.lg,
      fontSize: t.font.size.xs,
      background: isError ? t.colors.accent.redLight : t.colors.accent.greenLight,
      color: isError ? t.colors.accent.red : t.colors.accent.green,
      border: `1px solid ${isError ? '#fecaca' : '#bbf7d0'}`,
      marginTop: '8px',
    }}>
      {msg}
    </div>
  );
}

function ShimmerRow() {
  return (
    <div style={{ height: '36px', borderRadius: t.radius.lg, background: '#f1f5f9', marginBottom: '6px', animation: 'shimmer 1.5s infinite' }} />
  );
}

// ─── Account section ──────────────────────────────────────────────────────────

function AccountSection({ user }) {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type, msg }

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setFeedback(null);

    if (newPw.length < 6) {
      setFeedback({ type: 'error', msg: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPw !== confirmPw) {
      setFeedback({ type: 'error', msg: 'New passwords do not match.' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      setFeedback({ type: 'success', msg: 'Password updated successfully.' });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message || 'Failed to update password.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Card>
        <CardTitle>Email Address</CardTitle>
        <Input value={user?.email || ''} disabled />
        <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginTop: '6px' }}>
          Email cannot be changed here. Contact support if you need to update it.
        </div>
      </Card>

      <Card>
        <CardTitle>Change Password</CardTitle>
        <form onSubmit={handleChangePassword}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Field label="Current Password">
              <Input
                type="password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                placeholder="Enter current password"
              />
            </Field>
            <Field label="New Password">
              <Input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="Min 6 characters"
              />
            </Field>
            <Field label="Confirm New Password">
              <Input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="Repeat new password"
              />
            </Field>
          </div>
          <InlineAlert type={feedback?.type} msg={feedback?.msg} />
          <div style={{ marginTop: '16px' }}>
            <PrimaryBtn type="submit" disabled={saving || !newPw || !confirmPw}>
              {saving ? 'Updating…' : 'Update Password'}
            </PrimaryBtn>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ─── Integration card ─────────────────────────────────────────────────────────

function IntegrationCard({ name, icon, statusUrl, connectUrl, disconnectUrl, connectMethod = 'POST', fields }) {
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formValues, setFormValues] = useState(() => Object.fromEntries(fields.map(f => [f.key, ''])));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(statusUrl, {
        headers: session ? { 'Authorization': `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) { setConnected(false); return; }
      const data = await res.json();
      setConnected(data.connected === true);
    } catch {
      setConnected(false);
    } finally {
      setChecking(false);
    }
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(connectUrl, {
        method: connectMethod,
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(formValues),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Connection failed (${res.status})`);
      }
      setConnected(true);
      setShowForm(false);
      setSuccess('Connected successfully.');
      setFormValues(Object.fromEntries(fields.map(f => [f.key, ''])));
    } catch (err) {
      setError(err.message || 'Failed to connect.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    setError('');
    setSuccess('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(disconnectUrl, {
        method: 'DELETE',
        headers: session ? { 'Authorization': `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Disconnect failed (${res.status})`);
      }
      setConnected(false);
      setSuccess('Disconnected.');
    } catch (err) {
      setError(err.message || 'Failed to disconnect.');
    }
  };

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px' }}>{icon}</span>
          <div>
            <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, color: t.colors.text.primary }}>
              {name}
            </div>
            {!checking && <StatusBadge connected={connected} />}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {!checking && connected && (
            <GhostBtn onClick={handleDisconnect} style={{ fontSize: t.font.size.xs, padding: '5px 12px' }}>
              Disconnect
            </GhostBtn>
          )}
          {!checking && !connected && !showForm && (
            <PrimaryBtn onClick={() => setShowForm(true)} style={{ fontSize: t.font.size.xs, padding: '5px 12px' }}>
              Connect
            </PrimaryBtn>
          )}
          {showForm && (
            <GhostBtn onClick={() => { setShowForm(false); setError(''); }} style={{ fontSize: t.font.size.xs, padding: '5px 12px' }}>
              Cancel
            </GhostBtn>
          )}
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleConnect} style={{ marginTop: '16px', borderTop: `1px solid ${t.colors.border.default}`, paddingTop: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
            {fields.map(field => (
              <Field key={field.key} label={field.label}>
                <Input
                  type={field.type || 'text'}
                  value={formValues[field.key]}
                  onChange={e => setFormValues(v => ({ ...v, [field.key]: e.target.value }))}
                  placeholder={field.placeholder || ''}
                />
              </Field>
            ))}
          </div>
          {error && <InlineAlert type="error" msg={error} />}
          <div style={{ marginTop: '10px' }}>
            <PrimaryBtn type="submit" disabled={submitting} style={{ fontSize: t.font.size.xs }}>
              {submitting ? 'Connecting…' : 'Save & Connect'}
            </PrimaryBtn>
          </div>
        </form>
      )}

      {(success || (!showForm && error)) && (
        <InlineAlert type={error && !showForm ? 'error' : 'success'} msg={error && !showForm ? error : success} />
      )}
    </Card>
  );
}

// ─── Integrations section ─────────────────────────────────────────────────────

function IntegrationsSection() {
  return (
    <div>
      <IntegrationCard
        name="Truckstop"
        icon="🚛"
        statusUrl="/api/integrations/truckstop"
        connectUrl="/api/integrations/truckstop"
        disconnectUrl="/api/integrations/truckstop"
        fields={[
          { key: 'username', label: 'Username', placeholder: 'Truckstop username' },
          { key: 'password', label: 'Password', type: 'password', placeholder: 'Truckstop password' },
        ]}
      />
    </div>
  );
}

// ─── Organization section ─────────────────────────────────────────────────────

function OrganizationSection({ user }) {
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState(null);

  const orgName = user?.user_metadata?.org_name
    || (user?.email ? user.email.split('@')[1] : 'Your Organization');

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    setLoadingMembers(true);
    setMembersError('');
    try {
      const res = await fetch('/api/orgs/members');
      if (!res.ok) throw new Error('Not available');
      const data = await res.json();
      setMembers(Array.isArray(data) ? data : data.members || []);
    } catch {
      setMembersError('Organization info unavailable.');
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteFeedback(null);
    try {
      const res = await fetch('/api/orgs/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Invite failed');
      }
      setInviteFeedback({ type: 'success', msg: `Invite sent to ${inviteEmail}.` });
      setInviteEmail('');
      setShowInviteForm(false);
    } catch (err) {
      setInviteFeedback({ type: 'error', msg: err.message || 'Failed to send invite.' });
    } finally {
      setInviting(false);
    }
  };

  return (
    <div>
      <Card>
        <CardTitle>Organization</CardTitle>
        <div style={{ fontSize: t.font.size.base, color: t.colors.text.primary, fontWeight: t.font.weight.medium }}>
          {orgName}
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <CardTitle style={{ marginBottom: 0 }}>Members</CardTitle>
          <PrimaryBtn onClick={() => setShowInviteForm(v => !v)} style={{ fontSize: t.font.size.xs, padding: '5px 12px' }}>
            {showInviteForm ? 'Cancel' : '+ Invite Member'}
          </PrimaryBtn>
        </div>

        {showInviteForm && (
          <form onSubmit={handleInvite} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '14px', paddingBottom: '14px', borderBottom: `1px solid ${t.colors.border.default}` }}>
            <Field label="Email Address" style={{ flex: 1 }}>
              <Input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
              />
            </Field>
            <PrimaryBtn type="submit" disabled={inviting || !inviteEmail.trim()} style={{ fontSize: t.font.size.xs, padding: '8px 14px', marginTop: '18px' }}>
              {inviting ? 'Sending…' : 'Send Invite'}
            </PrimaryBtn>
          </form>
        )}

        {inviteFeedback && <InlineAlert type={inviteFeedback.type} msg={inviteFeedback.msg} />}

        {loadingMembers ? (
          <div style={{ marginTop: '8px' }}>
            {[1, 2, 3].map(i => <ShimmerRow key={i} />)}
          </div>
        ) : membersError ? (
          <div style={{ color: t.colors.text.muted, fontSize: t.font.size.sm }}>{membersError}</div>
        ) : members.length === 0 ? (
          <div style={{ color: t.colors.text.muted, fontSize: t.font.size.sm }}>No members found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: t.font.size.sm }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: t.colors.text.muted, fontWeight: t.font.weight.semibold, fontSize: t.font.size.xs, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${t.colors.border.default}` }}>
                  Email
                </th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: t.colors.text.muted, fontWeight: t.font.weight.semibold, fontSize: t.font.size.xs, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${t.colors.border.default}` }}>
                  Role
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={m.id || m.email || i}>
                  <td style={{ padding: '8px 8px', color: t.colors.text.primary, borderBottom: `1px solid ${t.colors.border.default}` }}>
                    {m.email}
                  </td>
                  <td style={{ padding: '8px 8px', color: t.colors.text.muted, borderBottom: `1px solid ${t.colors.border.default}` }}>
                    {m.role || 'Member'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <style>{`@keyframes shimmer { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}

// ─── Accessibility section ────────────────────────────────────────────────────

function AccessibilitySection() {
  return (
    <div>
      <Card>
        <CardTitle>Theme</CardTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>☀️</span>
          <div>
            <div style={{ fontSize: t.font.size.sm, color: t.colors.text.primary, fontWeight: t.font.weight.medium }}>
              Light (v2 UI uses fixed light theme)
            </div>
            <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginTop: '2px' }}>
              The v2 interface uses a fixed light token theme. Dark mode was a v1 feature.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Developer section ────────────────────────────────────────────────────────

function DeveloperSection() {
  const [bypass, setBypass] = useState(() => localStorage.getItem('hm_credits_bypass') === 'true');
  const [useLegacyUI, setUseLegacyUI] = useState(() => localStorage.getItem('hm_ui') === 'v1');

  const handleBypassToggle = (val) => {
    setBypass(val);
    if (val) {
      localStorage.setItem('hm_credits_bypass', 'true');
    } else {
      localStorage.removeItem('hm_credits_bypass');
    }
  };

  const handleUIToggle = (val) => {
    setUseLegacyUI(val);
    if (val) {
      localStorage.setItem('hm_ui', 'v1');
    } else {
      localStorage.removeItem('hm_ui');
    }
    setTimeout(() => window.location.reload(), 150);
  };

  return (
    <div>
      <Card style={{ border: `1px solid ${t.colors.accent.amber}40`, background: t.colors.accent.amberLight }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '16px' }}>⚠️</span>
          <CardTitle style={{ marginBottom: 0, color: t.colors.accent.amber }}>Developer Tools</CardTitle>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <Toggle
              checked={useLegacyUI}
              onChange={handleUIToggle}
              label="Use legacy UI (v1)"
            />
            <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginTop: '4px', marginLeft: '46px' }}>
              Reverts to the original interface. Reloads the page immediately.
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${t.colors.accent.amber}30`, paddingTop: '16px' }}>
            <Toggle
              checked={bypass}
              onChange={handleBypassToggle}
              label="Skip credit deduction (dev only)"
            />
            <div style={{ fontSize: t.font.size.xs, color: t.colors.text.muted, marginTop: '4px', marginLeft: '46px' }}>
              When enabled, searches run without consuming credits. Stored in localStorage.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Section nav ──────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'organization', label: 'Organization' },
  { id: 'accessibility', label: 'Accessibility' },
];

function SectionNav({ activeId, onSelect, showDeveloper }) {
  return (
    <div style={{
      width: '200px',
      minWidth: '200px',
      paddingTop: '4px',
    }}>
      {[...SECTIONS, ...(showDeveloper ? [{ id: 'developer', label: 'Developer' }] : [])].map(section => {
        const active = activeId === section.id;
        return (
          <button
            key={section.id}
            onClick={() => onSelect(section.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              borderLeft: `3px solid ${active ? t.colors.accent.blue : 'transparent'}`,
              color: active ? t.colors.accent.blue : t.colors.text.secondary,
              fontSize: t.font.size.sm,
              fontWeight: active ? t.font.weight.semibold : t.font.weight.medium,
              cursor: 'pointer',
              fontFamily: t.font.family,
              borderRadius: `0 ${t.radius.lg} ${t.radius.lg} 0`,
              transition: 'color 0.12s, border-color 0.12s',
            }}
          >
            {section.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── SettingsView ─────────────────────────────────────────────────────────────

export function SettingsView() {
  const { user, isAdmin } = useAuth();
  const isMobile = useMobile();
  const [activeSection, setActiveSection] = useState('account');
  const [mobileShowContent, setMobileShowContent] = useState(false);

  const showDeveloper = !!isAdmin;

  const handleMobileSelect = (id) => {
    setActiveSection(id);
    if (isMobile) setMobileShowContent(true);
  };

  const sectionLabel = SECTIONS.find(s => s.id === activeSection)?.label
    || (activeSection === 'developer' ? 'Developer' : 'Settings');

  return (
    <div style={{
      display: 'flex',
      gap: isMobile ? '0' : '32px',
      alignItems: 'flex-start',
      fontFamily: t.font.family,
      height: isMobile ? '100%' : 'auto',
    }}>
      {/* Nav — hidden on mobile when content is showing */}
      {(!isMobile || !mobileShowContent) && (
        <SectionNav
          activeId={activeSection}
          onSelect={handleMobileSelect}
          showDeveloper={showDeveloper}
        />
      )}

      {/* Content — full width on mobile */}
      {(!isMobile || mobileShowContent) && (
        <div style={{ flex: 1, minWidth: 0 }}>
          {isMobile && mobileShowContent && (
            <button
              onClick={() => setMobileShowContent(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.colors.accent.blue, fontSize: t.font.size.sm, fontWeight: t.font.weight.semibold, padding: '4px 0', marginBottom: '16px', display: 'block' }}
            >
              ‹ Settings
            </button>
          )}
          <div style={{
            fontSize: t.font.size['2xl'],
            fontWeight: t.font.weight.bold,
            color: t.colors.text.primary,
            marginBottom: '24px',
            letterSpacing: '-0.01em',
          }}>
            {sectionLabel}
          </div>

          {activeSection === 'account' && <AccountSection user={user} />}
          {activeSection === 'integrations' && <IntegrationsSection />}
          {activeSection === 'organization' && <OrganizationSection user={user} />}
          {activeSection === 'accessibility' && <AccessibilitySection />}
          {activeSection === 'developer' && showDeveloper && <DeveloperSection />}
        </div>
      )}
    </div>
  );
}
