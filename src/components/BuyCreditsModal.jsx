import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';

const PACKAGES = [
  {
    id: 'starter',
    name: 'Starter',
    credits: 10,
    price: 50,
    perCredit: '$5.00',
    description: 'Great for getting started'
  },
  {
    id: 'pro',
    name: 'Pro',
    credits: 30,
    price: 75,
    perCredit: '$2.50',
    highlight: true,
    badge: 'Best Value',
    description: 'Most popular for active fleets'
  },
  {
    id: 'fleet',
    name: 'Fleet',
    credits: 100,
    price: 200,
    perCredit: '$2.00',
    description: 'High volume operations'
  }
];

export const BuyCreditsModal = ({ onClose, onPurchase, insufficientCredits = false, defaultPackage = null }) => {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(null);
  const [highlighted, setHighlighted] = useState(defaultPackage);

  const handleSelect = async (pkg) => {
    setLoading(pkg.id);
    await onPurchase(pkg.id);
    setLoading(null);
  };

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div style={{
        background: colors.background.primary,
        border: `1px solid ${colors.border.secondary}`,
        borderRadius: '16px',
        width: '100%',
        maxWidth: '520px',
        padding: '28px',
        position: 'relative'
      }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: colors.text.muted, cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '4px 8px' }}
        >
          ×
        </button>

        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 800, color: colors.text.primary }}>
            {insufficientCredits ? 'Out of Credits' : 'Buy Credits'}
          </h2>
          <p style={{ margin: 0, fontSize: '14px', color: colors.text.secondary }}>
            {insufficientCredits
              ? 'You need credits to run a backhaul search. Each search costs 1 credit.'
              : 'Each backhaul or estimate search costs 1 credit. Credits never expire.'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          {PACKAGES.map((pkg) => (
            <button
              key={pkg.id}
              onClick={() => handleSelect(pkg)}
              disabled={loading !== null}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 18px',
                background: pkg.highlight || highlighted === pkg.id ? `${colors.accent.primary}10` : colors.background.secondary,
                border: `1px solid ${pkg.highlight || highlighted === pkg.id ? colors.accent.primary : colors.border.secondary}`,
                borderRadius: '10px',
                cursor: loading !== null ? 'wait' : 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
                opacity: loading !== null && loading !== pkg.id ? 0.5 : 1
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px', height: '44px',
                  borderRadius: '10px',
                  background: pkg.highlight ? `${colors.accent.primary}25` : colors.background.primary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <span style={{ fontSize: '22px', fontWeight: 900, color: pkg.highlight ? colors.accent.primary : colors.text.primary, lineHeight: 1 }}>
                    {loading === pkg.id ? '…' : pkg.credits}
                  </span>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: colors.text.primary }}>{pkg.name}</span>
                    {pkg.badge && (
                      <span style={{
                        fontSize: '10px', fontWeight: 700, padding: '2px 6px',
                        background: colors.accent.primary, color: '#0d1117',
                        borderRadius: '4px', letterSpacing: '0.5px'
                      }}>
                        {pkg.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: colors.text.secondary, marginTop: '2px' }}>
                    {pkg.credits} credits · {pkg.perCredit}/credit · {pkg.description}
                  </div>
                </div>
              </div>
              <div style={{ flexShrink: 0, marginLeft: '12px', textAlign: 'right' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: pkg.highlight ? colors.accent.primary : colors.text.primary }}>
                  ${pkg.price}
                </div>
              </div>
            </button>
          ))}
        </div>

        <p style={{ margin: 0, fontSize: '12px', color: colors.text.muted, textAlign: 'center' }}>
          Payments processed securely by Stripe. Credits never expire.
        </p>
      </div>
    </div>
  );
};
