import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { ArrowLeft, Download, TrendingUp, DollarSign, Truck, MapPin, Calendar, Edit, X } from '../icons';

// ─── Metric helpers ──────────────────────────────────────────────────────────

const avg = (arr, field) =>
  arr.length ? arr.reduce((s, m) => s + (Number(m[field]) || 0), 0) / arr.length : 0;

const buildCategory = (source, annualVolume) => {
  const netCredit      = Number(source.customer_net_credit) || 0;
  const carrierSplit   = Number(source.carrier_revenue)     || 0;
  const oorMilesCost   = Number(source.mileage_expense)     || 0;
  const oorStopsCost   = Number(source.stop_expense)        || 0;
  const oorFsc         = Number(source.fuel_surcharge)      || 0;
  const otherCharges   = Number(source.other_charges)       || 0;
  const additionalMiles = Number(source.additionalMiles)    || 0;

  const stopCount = Number(source.stop_count) || 2;

  return {
    netCredit,
    annualCredit:      netCredit     * annualVolume,
    annualCarrierSplit: carrierSplit * annualVolume,
    annualOorMiles:    oorMilesCost  * annualVolume,
    annualOorStops:    oorStopsCost  * annualVolume,
    annualOorFsc:      oorFsc        * annualVolume,
    annualOtherCharges: otherCharges * annualVolume,
    carrierTotal:      (carrierSplit + oorMilesCost + oorStopsCost + oorFsc + otherCharges) * annualVolume,
    additionalMiles,
    annualMiles:       additionalMiles * annualVolume,
    stopCount,
  };
};

const computeMetrics = (matches, annualVolume) => {
  if (!matches.length) return null;
  const top5 = matches.slice(0, 5);

  const avgAllSource = {
    customer_net_credit: avg(matches, 'customer_net_credit'),
    carrier_revenue:     avg(matches, 'carrier_revenue'),
    mileage_expense:     avg(matches, 'mileage_expense'),
    stop_expense:        avg(matches, 'stop_expense'),
    fuel_surcharge:      avg(matches, 'fuel_surcharge'),
    other_charges:       avg(matches, 'other_charges'),
    additionalMiles:     avg(matches, 'additionalMiles'),
    stop_count:          avg(matches, 'stop_count'),
  };
  const avgTop5Source = {
    customer_net_credit: avg(top5, 'customer_net_credit'),
    carrier_revenue:     avg(top5, 'carrier_revenue'),
    mileage_expense:     avg(top5, 'mileage_expense'),
    stop_expense:        avg(top5, 'stop_expense'),
    fuel_surcharge:      avg(top5, 'fuel_surcharge'),
    other_charges:       avg(top5, 'other_charges'),
    additionalMiles:     avg(top5, 'additionalMiles'),
    stop_count:          avg(top5, 'stop_count'),
  };

  return {
    totalOpportunities: matches.length,
    highestNet:  buildCategory(matches[0], annualVolume),
    averageAll:  buildCategory(avgAllSource, annualVolume),
    averageTop5: buildCategory(avgTop5Source, annualVolume),
  };
};

// ─── Formatting ──────────────────────────────────────────────────────────────

const fmt$ = (v) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v ?? 0);

const fmtNum = (v, decimals = 0) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v ?? 0);

const fmtDate = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ─── Component ───────────────────────────────────────────────────────────────

export const EstimateResults = ({ request, fleet, matches, onBack, onEdit, onCancel }) => {
  const { colors } = useTheme();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const handleCancelRequest = async () => {
    if (!cancelReason.trim()) {
      alert('Please select a cancellation reason');
      return;
    }
    setCancelling(true);
    try {
      await onCancel(cancelReason);
      setShowCancelDialog(false);
    } catch (error) {
      console.error('Error cancelling request:', error);
      alert('Failed to cancel request');
    } finally {
      setCancelling(false);
    }
  };

  const annualVolume = request.annual_volume || 0;
  const minNetCredit = request.min_net_credit ?? null;
  const filteredMatches = minNetCredit !== null
    ? matches.filter(m => (Number(m.customer_net_credit) || 0) >= minNetCredit)
    : matches;
  const metrics      = computeMetrics(filteredMatches, annualVolume);
  const hasRates     = filteredMatches.length > 0 && filteredMatches[0].has_rate_config;
  const today        = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const handlePrint = () => window.print();

  // ── Shared cell style ──
  const cell = (highlight = false) => ({
    padding: '14px 18px',
    textAlign: 'right',
    borderBottom: `1px solid ${colors.border.secondary}`,
    fontSize: '14px',
    fontWeight: highlight ? 800 : 600,
    color: highlight ? colors.accent.success : colors.text.primary,
    background: highlight ? `${colors.accent.success}08` : 'transparent',
  });

  const labelCell = {
    padding: '14px 18px',
    borderBottom: `1px solid ${colors.border.secondary}`,
    fontSize: '13px',
    color: colors.text.secondary,
    fontWeight: 600,
  };

  const subheadRow = (label) => (
    <tr>
      <td colSpan={4} style={{
        padding: '10px 18px 6px',
        fontSize: '11px',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: colors.accent.primary,
        background: `${colors.accent.primary}08`,
        borderBottom: `1px solid ${colors.border.secondary}`,
      }}>
        {label}
      </td>
    </tr>
  );

  const belowMin = (val) => minNetCredit !== null && val < minNetCredit;

  return (
    <div>
      {/* Back + action buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }} className="no-print">
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'transparent', border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.secondary, fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
        >
          <ArrowLeft size={16} /> Back to Estimate Requests
        </button>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={handlePrint}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: colors.accent.primary, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
          >
            <Download size={16} /> Print / Save as PDF
          </button>
          {onEdit && (
            <button
              onClick={onEdit}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
            >
              <Edit size={16} /> Edit Estimate Request
            </button>
          )}
          {onCancel && (
            <button
              onClick={() => setShowCancelDialog(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: colors.background.secondary, border: `2px solid ${colors.accent.danger}`, borderRadius: '8px', color: colors.accent.danger, fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
            >
              <X size={16} /> Cancel Estimate Request
            </button>
          )}
        </div>
      </div>

      {/* Cancel Request Dialog */}
      {showCancelDialog && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => !cancelling && setShowCancelDialog(false)}>
          <div style={{ background: colors.background.overlay, borderRadius: '16px', maxWidth: '500px', width: '100%', border: `1px solid ${colors.border.accent}`, boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '24px', borderBottom: `1px solid ${colors.border.secondary}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: colors.accent.danger }}>Cancel Estimate Request?</h3>
                <button onClick={() => setShowCancelDialog(false)} disabled={cancelling} style={{ background: 'none', border: 'none', cursor: cancelling ? 'not-allowed' : 'pointer', padding: '4px', color: colors.text.secondary, opacity: cancelling ? 0.5 : 1 }}>
                  <X size={24} />
                </button>
              </div>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ margin: '0 0 20px 0', color: colors.text.secondary, fontSize: '14px' }}>
                Are you sure you want to cancel <strong>{request.request_name}</strong>? This will mark the request as cancelled.
              </p>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.text.primary }}>Cancellation Reason *</label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  disabled={cancelling}
                  style={{ width: '100%', padding: '12px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', outline: 'none', cursor: cancelling ? 'not-allowed' : 'pointer' }}
                >
                  <option value="">-- Select a reason --</option>
                  <option value="No longer needed">No longer needed</option>
                  <option value="Found alternative">Found alternative</option>
                  <option value="Route changed">Route changed</option>
                  <option value="Equipment unavailable">Equipment unavailable</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowCancelDialog(false)} disabled={cancelling} style={{ padding: '12px 24px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', fontWeight: 600, cursor: cancelling ? 'not-allowed' : 'pointer', opacity: cancelling ? 0.5 : 1 }}>
                  Keep Estimate Request
                </button>
                <button onClick={handleCancelRequest} disabled={cancelling || !cancelReason} style={{ padding: '12px 24px', background: colors.accent.danger, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: (cancelling || !cancelReason) ? 'not-allowed' : 'pointer', opacity: (cancelling || !cancelReason) ? 0.5 : 1 }}>
                  {cancelling ? 'Cancelling...' : 'Yes, Cancel Estimate Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Report ── */}
      <div id="estimate-report" style={{ background: colors.background.card, border: `1px solid ${colors.border.primary}`, borderRadius: '16px', overflow: 'hidden' }}>

        {/* Report header */}
        <div style={{ padding: '28px 32px', background: colors.background.secondary, borderBottom: `1px solid ${colors.border.secondary}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: colors.accent.primary, marginBottom: '6px' }}>
                Estimate Report
              </div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '24px', fontWeight: 900, color: colors.text.primary }}>
                {request.request_name}
              </h3>
              <div style={{ fontSize: '14px', color: colors.text.secondary }}>
                {fleet?.name || 'Unknown Fleet'}
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '13px', color: colors.text.secondary, lineHeight: '1.8' }}>
              <div><strong>Generated:</strong> {today}</div>
              <div><strong>Fleet:</strong> {fleet?.name || 'Unknown Fleet'}</div>
              {fleet?.home_address && <div><strong>Fleet Home:</strong> {fleet.home_address}</div>}
              <div><strong>Datum:</strong> {request.datum_point}</div>
              <div><strong>Pickup Window:</strong> {fmtDate(request.equipment_available_date)} – {fmtDate(request.equipment_needed_date)}</div>
              {annualVolume > 0 && <div><strong>Annual Volume:</strong> {annualVolume} loads/yr</div>}
            </div>
          </div>
        </div>

        {/* Opportunity count banner */}
        <div style={{ padding: '16px 32px', background: `${colors.accent.primary}10`, borderBottom: `1px solid ${colors.accent.primary}20`, display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TrendingUp size={20} color={colors.accent.primary} />
            <span style={{ fontSize: '15px', fontWeight: 800, color: colors.text.primary }}>
              {metrics?.totalOpportunities ?? 0} Available Opportunities Found
              {minNetCredit !== null && filteredMatches.length < matches.length && (
                <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text.secondary, marginLeft: '8px' }}>
                  ({matches.length - filteredMatches.length} below {fmt$(minNetCredit)} min excluded)
                </span>
              )}
            </span>
          </div>
          {request.is_relay && (
            <div style={{ padding: '4px 12px', background: `${colors.accent.primary}20`, borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: colors.accent.primary }}>
              RELAY MODE
            </div>
          )}
          {!hasRates && (
            <div style={{ fontSize: '13px', color: colors.accent.warning ?? colors.text.tertiary, fontWeight: 600 }}>
              ⚠ Fleet rate config not set — financial calculations unavailable
            </div>
          )}
        </div>

        {metrics && hasRates ? (
          <>
            {/* ── Column headers ── */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: colors.background.secondary }}>
                    <th style={{ padding: '16px 18px', textAlign: 'left',  fontSize: '13px', fontWeight: 700, color: colors.text.secondary, borderBottom: `2px solid ${colors.border.secondary}`, width: '35%' }}>
                      Metric
                    </th>
                    <th style={{ padding: '16px 18px', textAlign: 'right', fontSize: '13px', fontWeight: 800, color: colors.text.primary,    borderBottom: `2px solid ${colors.border.secondary}` }}>
                      Highest Net
                    </th>
                    <th style={{ padding: '16px 18px', textAlign: 'right', fontSize: '13px', fontWeight: 800, color: colors.text.primary,    borderBottom: `2px solid ${colors.border.secondary}` }}>
                      Average (All {metrics.totalOpportunities})
                    </th>
                    <th style={{ padding: '16px 18px', textAlign: 'right', fontSize: '13px', fontWeight: 800, color: colors.text.primary,    borderBottom: `2px solid ${colors.border.secondary}` }}>
                      Top 5 Average
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {/* ── Customer Credit ── */}
                  {subheadRow('Customer Credit')}
                  <tr>
                    <td style={labelCell}>Net Credit per Load</td>
                    <td style={cell(belowMin(metrics.highestNet.netCredit)  === false)}>{fmt$(metrics.highestNet.netCredit)}</td>
                    <td style={cell(false)}>{fmt$(metrics.averageAll.netCredit)}</td>
                    <td style={cell(false)}>{fmt$(metrics.averageTop5.netCredit)}</td>
                  </tr>
                  {annualVolume > 0 && (
                    <tr>
                      <td style={labelCell}>Annual Credit ({annualVolume} loads)</td>
                      <td style={cell(false)}>{fmt$(metrics.highestNet.annualCredit)}</td>
                      <td style={cell(false)}>{fmt$(metrics.averageAll.annualCredit)}</td>
                      <td style={cell(false)}>{fmt$(metrics.averageTop5.annualCredit)}</td>
                    </tr>
                  )}

                  {/* ── Route Activity ── */}
                  {subheadRow('Route Activity')}
                  <tr>
                    <td style={labelCell}>Carrier Miles (per load)</td>
                    <td style={cell(false)}>{fmtNum(metrics.highestNet.additionalMiles)} mi</td>
                    <td style={cell(false)}>{fmtNum(metrics.averageAll.additionalMiles)} mi</td>
                    <td style={cell(false)}>{fmtNum(metrics.averageTop5.additionalMiles)} mi</td>
                  </tr>
                  {annualVolume > 0 && (
                    <tr>
                      <td style={labelCell}>Total Annual Mileage Add ({annualVolume} loads)</td>
                      <td style={cell(false)}>{fmtNum(metrics.highestNet.annualMiles)} mi</td>
                      <td style={cell(false)}>{fmtNum(metrics.averageAll.annualMiles)} mi</td>
                      <td style={cell(false)}>{fmtNum(metrics.averageTop5.annualMiles)} mi</td>
                    </tr>
                  )}
                  <tr>
                    <td style={labelCell}>Stops Added (per load)</td>
                    <td style={cell(false)}>{fmtNum(metrics.highestNet.stopCount)}</td>
                    <td style={cell(false)}>{fmtNum(metrics.averageAll.stopCount)}</td>
                    <td style={cell(false)}>{fmtNum(metrics.averageTop5.stopCount)}</td>
                  </tr>

                  {/* ── Carrier Revenue Breakdown ── */}
                  {subheadRow('Carrier Annual Revenue Components')}
                  <tr>
                    <td style={labelCell}>Backhaul % Split</td>
                    <td style={cell(false)}>{fmt$(metrics.highestNet.annualCarrierSplit)}</td>
                    <td style={cell(false)}>{fmt$(metrics.averageAll.annualCarrierSplit)}</td>
                    <td style={cell(false)}>{fmt$(metrics.averageTop5.annualCarrierSplit)}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>OOR Miles (carrier miles × rate × vol)</td>
                    <td style={cell(false)}>{fmt$(metrics.highestNet.annualOorMiles)}</td>
                    <td style={cell(false)}>{fmt$(metrics.averageAll.annualOorMiles)}</td>
                    <td style={cell(false)}>{fmt$(metrics.averageTop5.annualOorMiles)}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>OOR Stops (2 per load × stop rate × vol)</td>
                    <td style={cell(false)}>{fmt$(metrics.highestNet.annualOorStops)}</td>
                    <td style={cell(false)}>{fmt$(metrics.averageAll.annualOorStops)}</td>
                    <td style={cell(false)}>{fmt$(metrics.averageTop5.annualOorStops)}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>OOR Fuel Surcharge (FSC × OOR mi × vol)</td>
                    <td style={cell(false)}>{fmt$(metrics.highestNet.annualOorFsc)}</td>
                    <td style={cell(false)}>{fmt$(metrics.averageAll.annualOorFsc)}</td>
                    <td style={cell(false)}>{fmt$(metrics.averageTop5.annualOorFsc)}</td>
                  </tr>
                  {(metrics.highestNet.annualOtherCharges > 0 || metrics.averageAll.annualOtherCharges > 0) && (
                    <tr>
                      <td style={labelCell}>Other Charges (annual)</td>
                      <td style={cell(false)}>{fmt$(metrics.highestNet.annualOtherCharges)}</td>
                      <td style={cell(false)}>{fmt$(metrics.averageAll.annualOtherCharges)}</td>
                      <td style={cell(false)}>{fmt$(metrics.averageTop5.annualOtherCharges)}</td>
                    </tr>
                  )}

                  {/* ── Carrier Total ── */}
                  {subheadRow('Carrier Total Annual Revenue Addition')}
                  <tr style={{ background: `${colors.accent.primary}08` }}>
                    <td style={{ ...labelCell, fontWeight: 800, color: colors.text.primary, fontSize: '14px' }}>
                      Total Carrier Revenue Addition
                    </td>
                    <td style={{ ...cell(true), fontSize: '15px' }}>{fmt$(metrics.highestNet.carrierTotal)}</td>
                    <td style={{ ...cell(true), fontSize: '15px' }}>{fmt$(metrics.averageAll.carrierTotal)}</td>
                    <td style={{ ...cell(true), fontSize: '15px' }}>{fmt$(metrics.averageTop5.carrierTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Min net credit note */}
            {minNetCredit !== null && (
              <div style={{ padding: '16px 24px', borderTop: `1px solid ${colors.border.secondary}`, fontSize: '13px', color: colors.text.secondary }}>
                <strong>Minimum Net Credit Threshold:</strong> {fmt$(minNetCredit)} per load — report shows only qualifying opportunities
              </div>
            )}
          </>
        ) : metrics && !hasRates ? (
          <div style={{ padding: '48px', textAlign: 'center', color: colors.text.secondary }}>
            <DollarSign size={48} color={colors.text.tertiary} style={{ marginBottom: '16px' }} />
            <p style={{ fontSize: '15px', fontWeight: 600 }}>Fleet rate configuration is required to generate financial projections.</p>
            <p style={{ fontSize: '13px' }}>Set revenue split %, mileage rate, stop rate, and fuel settings in the Fleet Setup.</p>
          </div>
        ) : (
          <div style={{ padding: '48px', textAlign: 'center', color: colors.text.secondary }}>
            <TrendingUp size={48} color={colors.text.tertiary} style={{ marginBottom: '16px' }} />
            {minNetCredit !== null && matches.length > 0 && filteredMatches.length === 0 ? (
              <>
                <p style={{ fontSize: '15px', fontWeight: 600 }}>No opportunities meet the {fmt$(minNetCredit)} minimum net credit threshold.</p>
                <p style={{ fontSize: '13px' }}>{matches.length} {matches.length === 1 ? 'opportunity was' : 'opportunities were'} found but none qualified. Try lowering the minimum net credit.</p>
              </>
            ) : (
              <>
                <p style={{ fontSize: '15px', fontWeight: 600 }}>No matching opportunities found for this route.</p>
                <p style={{ fontSize: '13px' }}>Try a different datum point or check fleet equipment settings.</p>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          #estimate-report { border: none !important; border-radius: 0 !important; }
        }
      `}</style>
    </div>
  );
};
