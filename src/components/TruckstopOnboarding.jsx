import { useState } from 'react';
import { supabase } from '../lib/supabase';

const GREEN = '#1B7A4A';

async function postOnboarding(onboarding_action, body = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/integrations/truckstop?action=onboard', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ onboarding_action, ...body }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export function TruckstopOnboarding({ org, isOrgAdmin, onComplete }) {
  const [step, setStep] = useState(1);        // 1 = are you a customer? 2 = do you have your ID?
  const [path, setPath] = useState(null);     // 'have_id' | 'no_id' | 'not_customer'
  const [integrationId, setIntegrationId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [doneMessage, setDoneMessage] = useState('');

  const orgName = org?.name || 'your organization';

  const handle = async (action, body = {}, successMsg) => {
    setError('');
    setLoading(true);
    try {
      await postOnboarding(action, body);
      setDoneMessage(successMsg);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', padding: '8px 0 24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✓</div>
            <h2 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: 800, color: '#1a1a1a' }}>
              You're all set
            </h2>
            <p style={{ margin: '0 0 24px', color: '#555', fontSize: '15px', lineHeight: 1.6 }}>
              {doneMessage}
            </p>
            <button onClick={() => onComplete('dashboard')} style={primaryBtn}>
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '13px', flexShrink: 0 }}>
            TS
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#1a1a1a' }}>
              Truckstop Setup
            </h2>
            <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
              A quick step to connect {orgName} to live Truckstop loads
            </p>
          </div>
        </div>

        {error && (
          <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', fontSize: '14px', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        {/* Step 1: Are you a Truckstop customer? */}
        {step === 1 && (
          <div>
            <p style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 600, color: '#1a1a1a' }}>
              Does {orgName} currently subscribe to Truckstop?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => setStep(2)}
                style={choiceBtn}
              >
                Yes, we're a Truckstop customer
              </button>
              <button
                onClick={() => handle('not_customer', {}, "We've notified Truckstop's sales team to reach out about getting you set up.")}
                disabled={loading}
                style={choiceBtn}
              >
                {loading ? 'Sending…' : "No, we're not yet"}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Do you have your Integration ID? */}
        {step === 2 && (
          <div>
            <p style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 600, color: '#1a1a1a' }}>
              Do you have your Truckstop Integration ID?
            </p>

            {path === null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button onClick={() => setPath('have_id')} style={choiceBtn}>
                  Yes, I have it
                </button>
                <button
                  onClick={() => handle('no_id', {}, "We've emailed Truckstop asking them to send your Integration ID. You can add it later in Settings → Integrations.")}
                  disabled={loading}
                  style={choiceBtn}
                >
                  {loading ? 'Sending…' : "No, I'll need to get it"}
                </button>
                <button onClick={() => setStep(1)} style={ghostBtn}>
                  ← Back
                </button>
              </div>
            )}

            {path === 'have_id' && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>
                  Integration ID
                </label>
                <input
                  type="text"
                  value={integrationId}
                  onChange={e => setIntegrationId(e.target.value)}
                  placeholder="e.g. 12345"
                  disabled={loading}
                  style={{ width: '100%', padding: '12px', border: '1px solid #d0d0d0', borderRadius: '8px', fontSize: '15px', color: '#1a1a1a', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }}
                  autoFocus
                />
                {!isOrgAdmin && (
                  <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#888' }}>
                    Only org admins can save the integration ID. Ask your admin to do this in Settings.
                  </p>
                )}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handle('save_id', { integration_id: integrationId }, 'Your Truckstop Integration ID has been saved. Your team can now search live Truckstop loads.')}
                    disabled={loading || !integrationId.trim() || !isOrgAdmin}
                    style={{ ...primaryBtn, flex: 1, opacity: (!integrationId.trim() || !isOrgAdmin) ? 0.5 : 1, cursor: (!integrationId.trim() || !isOrgAdmin) ? 'not-allowed' : 'pointer' }}
                  >
                    {loading ? 'Saving…' : 'Save Integration ID'}
                  </button>
                  <button onClick={() => setPath(null)} style={ghostBtn}>
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Skip link — always visible */}
        <div style={{ marginTop: '24px', textAlign: 'center', borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
          <button
            onClick={() => handle('skip', {}, "No problem — you can add your Truckstop Integration ID any time in Settings → Integrations.")}
            disabled={loading}
            style={{ background: 'none', border: 'none', color: '#999', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

const wrapStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f8f9fa',
  padding: '24px',
};

const cardStyle = {
  width: '100%',
  maxWidth: '480px',
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '32px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
};

const choiceBtn = {
  width: '100%',
  padding: '14px 20px',
  background: '#fff',
  border: '1px solid #d0d0d0',
  borderRadius: '10px',
  fontSize: '15px',
  fontWeight: 600,
  color: '#1a1a1a',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'border-color 0.15s',
};

const primaryBtn = {
  padding: '12px 24px',
  background: GREEN,
  border: 'none',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '15px',
  fontWeight: 700,
  cursor: 'pointer',
};

const ghostBtn = {
  padding: '12px 20px',
  background: '#f3f4f6',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 600,
  color: '#555',
  cursor: 'pointer',
};
