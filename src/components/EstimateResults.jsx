import { useTheme } from '../contexts/ThemeContext';
import { ArrowLeft, Download, TrendingUp, DollarSign, Truck, MapPin, Calendar } from '../icons';

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
  };
  const avgTop5Source = {
    customer_net_credit: avg(top5, 'customer_net_credit'),
    carrier_revenue:     avg(top5, 'carrier_revenue'),
    mileage_expense:     avg(top5, 'mileage_expense'),
    stop_expense:        avg(top5, 'stop_expense'),
    fuel_surcharge:      avg(top5, 'fuel_surcharge'),
    other_charges:       avg(top5, 'other_charges'),
    additionalMiles:     avg(top5, 'additionalMiles'),
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

const fmtDate = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ─── Component ───────────────────────────────────────────────────────────────

export const EstimateResults = ({ request, fleet, matches, onBack }) => {
  const { colors } = useTheme();

  const annualVolume = request.annual_volume || 0;
  const minNetCredit = request.min_net_credit ?? null;
  const metrics      = computeMetrics(matches, annualVolume);
  const hasRates     = matches.length > 0 && matches[0].has_rate_config;
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
      {/* Back + Print buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }} className="no-print">
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'transparent', border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.secondary, fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
        >
          <ArrowLeft size={16} /> Back to Estimate Requests
        </button>
        <button
          onClick={handlePrint}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: colors.accent.primary, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
        >
          <Download size={16} /> Print / Save as PDF
        </button>
      </div>

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
              <div><strong>Datum:</strong> {request.datum_point}</div>
              <div><strong>Available:</strong> {fmtDate(request.equipment_available_date)} – {fmtDate(request.equipment_needed_date)}</div>
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

                  {/* ── Carrier Revenue Breakdown ── */}
                  {subheadRow('Carrier Annual Revenue Components')}
                  <tr>
                    <td style={labelCell}>Backhaul % Split</td>
                    <td style={cell(false)}>{fmt$(metrics.highestNet.annualCarrierSplit)}</td>
                    <td style={cell(false)}>{fmt$(metrics.averageAll.annualCarrierSplit)}</td>
                    <td style={cell(false)}>{fmt$(metrics.averageTop5.annualCarrierSplit)}</td>
                  </tr>
                  <tr>
                    <td style={labelCell}>
                      OOR Miles
                      <span style={{ marginLeft: '6px', fontSize: '11px', color: colors.text.tertiary }}>
                        ({Math.round(metrics.highestNet.additionalMiles)} / {Math.round(metrics.averageAll.additionalMiles)} / {Math.round(metrics.averageTop5.additionalMiles)} mi avg × rate × vol)
                      </span>
                    </td>
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
                <strong>Minimum Net Credit Threshold:</strong> {fmt$(minNetCredit)} per load
                {metrics.highestNet.netCredit < minNetCredit && (
                  <span style={{ marginLeft: '12px', color: '#EF4444', fontWeight: 700 }}>
                    ⚠ No opportunities currently meet this threshold
                  </span>
                )}
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
            <p style={{ fontSize: '15px', fontWeight: 600 }}>No matching opportunities found for this route.</p>
            <p style={{ fontSize: '13px' }}>Try a different datum point or check fleet equipment settings.</p>
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
