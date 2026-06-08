import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';

const FAQ = [
  {
    q: 'How do I set up a fleet?',
    a: 'Go to Fleets in the menu, then click "New Fleet." Enter the fleet name, home city/state, and trailer type. You can add trucks (unit number, year, make/model) and drivers (name, phone, CDL) from the fleet detail page. To configure rate settings — cost per mile, target RPM, fuel surcharge — click the gear icon on the fleet.',
  },
  {
    q: 'How do I start a backhaul request?',
    a: 'Go to Start Backhaul Request. Select the fleet, enter the empty location (the city/state where the truck currently is), pick the equipment type and pickup date, then submit. Matching runs automatically and results are sorted best-first.',
  },
  {
    q: 'What is the empty location?',
    a: 'The empty location is the city and state where the truck is right now — the search origin. It\'s where the truck starts before picking up a backhaul load. Enter it as "City, State" (e.g., "Nashville, TN").',
  },
  {
    q: 'What are out-of-route (OOR) miles?',
    a: 'OOR miles are the extra miles a truck adds compared to driving straight home. Zero OOR means the load is perfectly on the way. Lower is better — the financial breakdown uses OOR miles to calculate the true net cost of taking a load.',
  },
  {
    q: 'Why isn\'t the financial breakdown showing on results?',
    a: 'Rate config must be set on the fleet. In Fleets, open the fleet and enter at minimum a cost per mile and FSC (fuel surcharge) rate. Once saved, the full breakdown — net revenue, mileage expense, carrier revenue — will appear on all results.',
  },
  {
    q: 'I\'m not seeing any results — what\'s wrong?',
    a: 'Check three things: (1) the fleet has a home location set, (2) the empty location is in "City, State" format, and (3) the equipment type matches available loads. If loads are sparse on a lane, try adjusting the empty location to a nearby major city.',
  },
  {
    q: 'What is relay mode and when should I use it?',
    a: 'Relay mode is for fleets where drivers always return to a home terminal between loads. When enabled, OOR miles are calculated as the full driver loop: home → pickup → delivery → home, rather than empty → pickup → delivery → home. Toggle it on the request form.',
  },
  {
    q: 'How do I record a completed load?',
    a: 'On any result, click "Haul This Load." This records the load as completed — capturing revenue, net revenue, OOR miles, and the completion date. Completed hauls feed into Fleet Reports.',
  },
  {
    q: 'How does the Negotiate button work?',
    a: 'When a broker posts a load with no rate ("Call for rate"), the Negotiate button opens a helper for that load. It shows your route charges, a walk-away floor (your breakeven) and a suggested lead-with target, plus where the load would rank against your other results if you land a given rate — so you can make the call with the numbers in front of you.',
  },
  {
    q: 'How do I add other users to my organization?',
    a: 'Go to Settings → Team/Organization and invite users by email. Org admins can manage team members and integration settings.',
  },
];

function ChevronIcon({ open, color }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke={color} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 0.18s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function FaqItem({ q, a, colors }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ borderBottom: `1px solid ${colors.border.secondary}` }}>
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
          color: hovered ? colors.accent.primary : colors.text.primary,
          fontSize: '15px',
          fontWeight: 600,
          transition: 'color 0.12s',
        }}
      >
        {q}
        <ChevronIcon open={open} color={hovered ? colors.accent.primary : colors.text.secondary} />
      </button>
      {open && (
        <div style={{
          paddingBottom: '16px',
          fontSize: '14px',
          color: colors.text.secondary,
          lineHeight: 1.7,
        }}>
          {a}
        </div>
      )}
    </div>
  );
}

export const HelpPage = ({ onMenuNavigate, onNavigateToSettings, onOpenCoDriver }) => {
  const { colors } = useTheme();

  return (
    <div style={{ minHeight: '100vh', background: colors.background.primary, color: colors.text.primary }}>
      {/* Header */}
      <header style={{
        padding: '24px 32px',
        borderBottom: `1px solid ${colors.border.secondary}`,
        background: colors.background.overlay,
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 1001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <HamburgerMenu currentView="help" onNavigate={onMenuNavigate} />
        <AvatarMenu onNavigateToSettings={onNavigateToSettings} />
      </header>

      {/* Content */}
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 32px 64px' }}>
        {/* Page title */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: '28px', fontWeight: 800, color: colors.text.primary }}>
            Help & Support
          </h1>
          <p style={{ margin: 0, fontSize: '15px', color: colors.text.secondary }}>
            Answers to common questions, plus the full user guide.
          </p>
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
            background: `linear-gradient(135deg, ${colors.accent.charcoal} 0%, #1a2a3a 100%)`,
            border: `1px solid ${colors.accent.primary}30`,
            borderRadius: '14px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '42px', height: '42px',
                borderRadius: '10px',
                background: `${colors.accent.primary}20`,
                border: `1px solid ${colors.accent.primary}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.accent.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '3px' }}>
                  Haul Monitor User Guide
                </div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)' }}>
                  Full walkthrough of every feature — fleet setup, requests, results, reports, and more.
                </div>
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </div>
        </a>

        {/* FAQ */}
        <div style={{
          background: colors.background.card,
          border: `1px solid ${colors.border.primary}`,
          borderRadius: '14px',
          padding: '8px 24px',
          marginBottom: '24px',
        }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            color: colors.text.secondary,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            padding: '16px 0 8px',
          }}>
            Frequently Asked Questions
          </div>
          {FAQ.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} colors={colors} />
          ))}
        </div>

        {/* Still need help */}
        <div style={{
          background: colors.background.card,
          border: `1px solid ${colors.border.primary}`,
          borderRadius: '14px',
          padding: '24px',
        }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: colors.text.primary, marginBottom: '4px' }}>
            Still have questions?
          </div>
          <div style={{ fontSize: '13px', color: colors.text.secondary, marginBottom: '20px' }}>
            Ask Co-driver for instant answers, or reach the support team by email.
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={onOpenCoDriver}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '9px 18px',
                background: colors.accent.primary,
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.accent.secondary; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.accent.primary; }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              Chat with Co-driver
            </button>
            <a
              href="mailto:support@haulmonitor.cloud"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '9px 18px',
                background: 'transparent',
                color: colors.text.secondary,
                border: `1px solid ${colors.border.accent}`,
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'none',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              support@haulmonitor.cloud
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
