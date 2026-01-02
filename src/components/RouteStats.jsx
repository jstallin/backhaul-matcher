import { Truck, Navigation, DollarSign, TrendingUp, MapPin } from '../icons';
import { useTheme } from '../contexts/ThemeContext';

export const RouteStats = ({ route, backhaul = null }) => {
  const { colors } = useTheme();

  // Calculate original route stats - defensive parsing
  const originalDistance = parseFloat(route?.distance) || 0;
  const originalRevenue = parseFloat(route?.revenue) || 0;
  const emptyReturnMiles = originalDistance; // Assuming return to origin
  const originalTotalMiles = originalDistance + emptyReturnMiles;
  const originalAvgRate = originalTotalMiles > 0 ? originalRevenue / originalTotalMiles : 0;

  // Calculate route with backhaul stats
  let newTotalMiles = originalDistance;
  let newRevenue = originalRevenue;
  let backhaulDistance = 0;
  let outOfRouteMiles = 0;
  let newAvgRate = originalAvgRate;

  if (backhaul) {
    outOfRouteMiles = parseFloat(backhaul.outOfRouteMiles) || 0;
    backhaulDistance = parseFloat(backhaul.distance) || 0;
    newTotalMiles = originalDistance + outOfRouteMiles + backhaulDistance;
    newRevenue = originalRevenue + (parseFloat(backhaul.revenue) || 0);
    newAvgRate = newTotalMiles > 0 ? newRevenue / newTotalMiles : 0;
  }

  // Calculate improvements
  const milesSaved = originalTotalMiles - newTotalMiles;
  const revenueGain = newRevenue - originalRevenue;
  const rateImprovement = newAvgRate - originalAvgRate;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Original Route */}
      <div style={{
        background: colors.background.card,
        border: `1px solid ${colors.border.primary}`,
        borderRadius: '12px',
        padding: '20px'
      }}>
        <h3 style={{
          margin: '0 0 16px 0',
          fontSize: '16px',
          fontWeight: 800,
          color: colors.text.primary,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Truck size={20} color={colors.accent.primary} />
          ORIGINAL ROUTE
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px',
            background: colors.background.secondary,
            borderRadius: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Navigation size={16} color={colors.text.secondary} />
              <span style={{ fontSize: '14px', color: colors.text.secondary }}>Primary Haul</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: colors.text.primary }}>
                {originalDistance} mi
              </div>
              <div style={{ fontSize: '12px', color: colors.accent.success }}>
                ${originalRevenue.toLocaleString()}
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px',
            background: colors.background.secondary,
            borderRadius: '8px',
            border: `2px dashed ${colors.accent.danger}40`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={16} color={colors.accent.danger} />
              <span style={{ fontSize: '14px', color: colors.text.secondary }}>Empty Return</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: colors.accent.danger }}>
                {emptyReturnMiles} mi
              </div>
              <div style={{ fontSize: '12px', color: colors.accent.danger }}>
                $0
              </div>
            </div>
          </div>

          <div style={{
            borderTop: `2px solid ${colors.border.primary}`,
            paddingTop: '12px',
            marginTop: '4px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: colors.text.primary }}>Total Miles:</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: colors.text.primary }}>
                {originalTotalMiles.toLocaleString()} mi
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: colors.text.primary }}>Total Revenue:</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: colors.text.primary }}>
                ${originalRevenue.toLocaleString()}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: colors.text.primary }}>Avg Rate:</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: colors.text.secondary }}>
                ${originalAvgRate.toFixed(2)}/mi
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Route with Backhaul */}
      {backhaul && (
        <>
          <div style={{
            background: colors.background.card,
            border: `2px solid ${colors.accent.success}`,
            borderRadius: '12px',
            padding: '20px'
          }}>
            <h3 style={{
              margin: '0 0 16px 0',
              fontSize: '16px',
              fontWeight: 800,
              color: colors.text.primary,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <TrendingUp size={20} color={colors.accent.success} />
              WITH BACKHAUL
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                background: colors.background.secondary,
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Navigation size={16} color={colors.text.secondary} />
                  <span style={{ fontSize: '14px', color: colors.text.secondary }}>Primary Haul</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: colors.text.primary }}>
                    {originalDistance} mi
                  </div>
                  <div style={{ fontSize: '12px', color: colors.accent.success }}>
                    ${originalRevenue.toLocaleString()}
                  </div>
                </div>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                background: colors.background.secondary,
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MapPin size={16} color={colors.accent.warning} />
                  <span style={{ fontSize: '14px', color: colors.text.secondary }}>Out-of-Route</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: colors.text.primary }}>
                    {outOfRouteMiles} mi
                  </div>
                </div>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                background: `${colors.accent.success}20`,
                borderRadius: '8px',
                border: `2px solid ${colors.accent.success}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <DollarSign size={16} color={colors.accent.success} />
                  <span style={{ fontSize: '14px', fontWeight: 700, color: colors.accent.success }}>Backhaul</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: colors.accent.success }}>
                    {backhaulDistance} mi
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: colors.accent.success }}>
                    +${backhaul.revenue.toLocaleString()}
                  </div>
                </div>
              </div>

              <div style={{
                borderTop: `2px solid ${colors.border.primary}`,
                paddingTop: '12px',
                marginTop: '4px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: colors.text.primary }}>Total Miles:</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: colors.text.primary }}>
                    {newTotalMiles.toLocaleString()} mi
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: colors.text.primary }}>Total Revenue:</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: colors.accent.success }}>
                    ${newRevenue.toLocaleString()}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: colors.text.primary }}>Avg Rate:</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: colors.accent.success }}>
                    ${newAvgRate.toFixed(2)}/mi
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Net Improvement */}
          <div style={{
            background: `linear-gradient(135deg, ${colors.accent.success}20 0%, ${colors.accent.success}10 100%)`,
            border: `2px solid ${colors.accent.success}`,
            borderRadius: '12px',
            padding: '20px'
          }}>
            <h3 style={{
              margin: '0 0 16px 0',
              fontSize: '16px',
              fontWeight: 800,
              color: colors.accent.success,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              💰 NET IMPROVEMENT
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div style={{
                textAlign: 'center',
                padding: '16px',
                background: colors.background.card,
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '24px', fontWeight: 900, color: colors.accent.success, marginBottom: '4px' }}>
                  +${revenueGain.toLocaleString()}
                </div>
                <div style={{ fontSize: '12px', color: colors.text.secondary }}>
                  Extra Revenue
                </div>
              </div>

              <div style={{
                textAlign: 'center',
                padding: '16px',
                background: colors.background.card,
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '24px', fontWeight: 900, color: colors.accent.success, marginBottom: '4px' }}>
                  {milesSaved > 0 ? '-' : ''}{Math.abs(milesSaved)} mi
                </div>
                <div style={{ fontSize: '12px', color: colors.text.secondary }}>
                  {milesSaved > 0 ? 'Miles Saved' : 'Extra Miles'}
                </div>
              </div>

              <div style={{
                textAlign: 'center',
                padding: '16px',
                background: colors.background.card,
                borderRadius: '8px'
              }}>
                <div style={{ fontSize: '24px', fontWeight: 900, color: colors.accent.success, marginBottom: '4px' }}>
                  +${rateImprovement.toFixed(2)}
                </div>
                <div style={{ fontSize: '12px', color: colors.text.secondary }}>
                  Per Mile
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
