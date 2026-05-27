import { useState } from 'react';
import { tokens } from '../../styles/tokens.v2';

const t = tokens;

const FAQ = [
  {
    q: 'How do I set up a fleet?',
    a: 'Go to Fleets in the left menu, then click "New Fleet." Enter the fleet name, home city/state, and trailer type. You can add trucks (unit number, year, make/model) and drivers (name, phone, CDL) from the fleet detail page. To configure rate settings — cost per mile, target RPM, fuel surcharge — click the gear icon on the fleet.',
  },
  {
    q: 'How do I start a backhaul request?',
    a: 'Go to Backhaul Requests → New Request. Select the fleet, enter the datum point (the city/state where the truck currently is), pick the equipment type and pickup date, then submit. Matching runs automatically and results are sorted best-first.',
  },
  {
    q: 'What is a datum point?',
    a: 'The datum point is the city and state where the truck is right now — the search origin. It\'s where the truck starts before picking up a backhaul load. Enter it as "City, State" (e.g., "Nashville, TN").',
  },
  {
    q: 'What are out-of-route (OOR) miles?',
    a: 'OOR miles are the extra miles a truck adds compared to driving straight home. Zero OOR means the load is perfectly on the way. Lower is better — the financial breakdown uses OOR miles to calculate the true net cost of taking a load.',
  },
  {
    q: 'Why isn\'t the financial breakdown showing on results?',
    a: 'Rate config must be set on the fleet. In Fleets, click the gear icon on the fleet and enter at minimum a cost per mile and FSC (fuel surcharge) rate. Once saved, the full breakdown — net revenue, mileage expense, carrier revenue — will appear on all results.',
  },
  {
    q: 'I\'m not seeing any results — what\'s wrong?',
    a: 'Check three things: (1) the fleet has a home location set, (2) the datum point is in "City, State" format, and (3) the equipment type matches available loads. If loads are sparse on a lane, try adjusting the datum point to a nearby major city.',
  },
  {
    q: 'What is relay mode and when should I use it?',
    a: 'Relay mode is for fleets where drivers always return to a home terminal between loads instead of running point-to-point. When enabled, OOR miles are calculated as the full driver loop: home → pickup → delivery → home, rather than datum → pickup → delivery → home. Toggle it on the request form.',
  },
  {
    q: 'How do I record a completed load?',
    a: 'On any result, click "Haul This Load." This records the load as completed — capturing revenue, net revenue, OOR miles, and the completion date. Completed hauls feed into Fleet Reports and improve AI recommendations over time.',
  },
  {
    q: 'How does the AI "Ask AI" feature work?',
    a: '"Ask AI" gives a TAKE IT / PASS / NEGOTIATE recommendation for a specific load, with reasoning. It considers your fleet\'s rate config, OOR miles, and history. You can rate responses with thumbs up/down — that feedback trains the AI to your fleet\'s preferences over time.',
  },
  {
    q: 'How do I add other users to my organization?',
    a: 'Go to Settings → Team/Organization and invite users by email. Org admins can manage team members and integration settings.',
  },
];

function ChevronIcon({ open }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transition: 'transform 0.18s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ExternalLinkIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function MessageIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function MailIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function HeadsetIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0118 0v6" />
      <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3z" />
      <path d="M3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
    </svg>
  );
}

function BookIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
      <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
    </svg>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{
      borderBottom: `1px solid ${t.colors.border.default}`,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '16px 0',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: hovered ? t.colors.accent.blue : t.colors.text.primary,
          fontFamily: t.font.family,
          fontSize: t.font.size.base,
          fontWeight: t.font.weight.medium,
          transition: 'color 0.12s',
        }}
      >
        {q}
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div style={{
          paddingBottom: '16px',
          fontSize: t.font.size.sm,
          color: t.colors.text.secondary,
          lineHeight: t.font.lineHeight.relaxed,
        }}>
          {a}
        </div>
      )}
    </div>
  );
}

export function HelpView({ onOpenCoDriver }) {
  return (
    <div style={{
      maxWidth: '760px',
      margin: '0 auto',
      padding: `0 ${t.layout.contentPadding}`,
      paddingBottom: '48px',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: t.font.size['3xl'], fontWeight: t.font.weight.bold, color: t.colors.text.primary, marginBottom: '6px' }}>
          Help & Support
        </div>
        <div style={{ fontSize: t.font.size.base, color: t.colors.text.muted }}>
          Answers to common questions, plus the full user guide.
        </div>
      </div>

      {/* User Guide CTA */}
      <a
        href="https://www.haulmonitor.cloud/user-guide.html"
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: 'none', display: 'block', marginBottom: '28px' }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5282 100%)',
          borderRadius: t.radius['2xl'],
          boxShadow: t.shadow.md,
          cursor: 'pointer',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '40px', height: '40px',
              borderRadius: t.radius.lg,
              background: 'rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff',
              flexShrink: 0,
            }}>
              <BookIcon size={20} />
            </div>
            <div>
              <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, color: '#fff', marginBottom: '2px' }}>
                Haul Monitor User Guide
              </div>
              <div style={{ fontSize: t.font.size.sm, color: 'rgba(255,255,255,0.65)' }}>
                Full walkthrough of every feature — fleet setup, requests, results, reports, and more.
              </div>
            </div>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', flexShrink: 0 }}>
            <ExternalLinkIcon size={18} />
          </div>
        </div>
      </a>

      {/* FAQ */}
      <div style={{
        background: t.colors.page.cardBg,
        border: `1px solid ${t.colors.page.cardBorder}`,
        borderRadius: t.radius.xl,
        padding: '8px 24px',
        marginBottom: '24px',
        boxShadow: t.shadow.sm,
      }}>
        <div style={{
          fontSize: t.font.size.sm,
          fontWeight: t.font.weight.semibold,
          color: t.colors.text.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          padding: '16px 0 8px',
        }}>
          Frequently Asked Questions
        </div>
        {FAQ.map((item, i) => (
          <FaqItem key={i} q={item.q} a={item.a} />
        ))}
      </div>

      {/* Still need help */}
      <div style={{
        background: t.colors.page.cardBg,
        border: `1px solid ${t.colors.page.cardBorder}`,
        borderRadius: t.radius.xl,
        padding: '24px',
        boxShadow: t.shadow.sm,
      }}>
        <div style={{ fontSize: t.font.size.base, fontWeight: t.font.weight.semibold, color: t.colors.text.primary, marginBottom: '4px' }}>
          Still have questions?
        </div>
        <div style={{ fontSize: t.font.size.sm, color: t.colors.text.muted, marginBottom: '20px' }}>
          Ask Co-driver for instant answers, or reach the support team by email.
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={onOpenCoDriver}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '9px 18px',
              background: t.colors.accent.blue,
              color: '#fff',
              border: 'none',
              borderRadius: t.radius.lg,
              fontSize: t.font.size.sm,
              fontWeight: t.font.weight.semibold,
              cursor: 'pointer',
              fontFamily: t.font.family,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = t.colors.accent.blueHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = t.colors.accent.blue; }}
          >
            <MessageIcon size={15} />
            Chat with Co-driver
          </button>
          <a
            href="mailto:support@haulmonitor.cloud"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '9px 18px',
              background: 'transparent',
              color: t.colors.text.secondary,
              border: `1px solid ${t.colors.border.default}`,
              borderRadius: t.radius.lg,
              fontSize: t.font.size.sm,
              fontWeight: t.font.weight.medium,
              cursor: 'pointer',
              textDecoration: 'none',
              fontFamily: t.font.family,
            }}
          >
            <MailIcon size={15} />
            support@haulmonitor.cloud
          </a>
          {/* Get Help Live (Crisp) — disabled until ready to launch
          <button
            onClick={() => window.$crisp?.push(['do', 'chat:open'])}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '9px 18px',
              background: '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: t.radius.lg,
              fontSize: t.font.size.sm,
              fontWeight: t.font.weight.semibold,
              cursor: 'pointer',
              fontFamily: t.font.family,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#15803d'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#16a34a'; }}
          >
            <HeadsetIcon size={15} />
            Get Help Live
          </button>
          */}
        </div>
      </div>
    </div>
  );
}
