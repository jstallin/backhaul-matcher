import { HaulMonitorLogo } from './HaulMonitorLogo';
import { useState, useEffect } from 'react';
import { TrendingUp, Truck, FileText, CheckCircle, X, DollarSign, MapPin, Navigation } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import { HamburgerMenu } from './HamburgerMenu';
import { AvatarMenu } from './AvatarMenu';
import { db } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export const FleetReports = ({ onMenuNavigate, onNavigateToSettings }) => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [fleets, setFleets] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selectedView, setSelectedView] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fleetsData, requestsData] = await Promise.all([
        db.fleets.getAll(user.id),
        db.requests.getAll(user.id)
      ]);
      setFleets(fleetsData || []);
      setRequests(requestsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      setFleets([]);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  // Calculate metrics
  const totalFleets = fleets.length;
  const totalRequests = requests.length;
  
  const completedRequests = requests.filter(r => r.status === 'completed');
  const cancelledRequests = requests.filter(r => r.status === 'cancelled');
  const expiredRequests = requests.filter(r => r.status === 'expired');
  
  const totalRevenue = completedRequests.reduce((sum, r) => sum + (parseFloat(r.revenue_amount) || 0), 0);
  const avgRevenue = completedRequests.length > 0 ? totalRevenue / completedRequests.length : 0;
  
  const totalOutOfRoute = completedRequests.reduce((sum, r) => sum + (parseFloat(r.out_of_route_miles) || 0), 0);
  const avgOutOfRoute = completedRequests.length > 0 ? totalOutOfRoute / completedRequests.length : 0;

  // Requests by fleet
  const requestsByFleet = fleets.map(fleet => ({
    fleet,
    total: requests.filter(r => r.fleet_id === fleet.id).length,
    completed: completedRequests.filter(r => r.fleet_id === fleet.id).length,
    cancelled: cancelledRequests.filter(r => r.fleet_id === fleet.id).length,
    expired: expiredRequests.filter(r => r.fleet_id === fleet.id).length
  }));

  // Cancellation reasons
  const cancellationReasons = cancelledRequests.reduce((acc, r) => {
    const reason = r.cancellation_reason || 'unknown';
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});

  const cancellationReasonsByFleet = fleets.map(fleet => ({
    fleet,
    reasons: cancelledRequests
      .filter(r => r.fleet_id === fleet.id)
      .reduce((acc, r) => {
        const reason = r.cancellation_reason || 'unknown';
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {})
  }));

  // Expiration reasons (similar structure)
  const expirationReasonsByFleet = fleets.map(fleet => ({
    fleet,
    reasons: expiredRequests
      .filter(r => r.fleet_id === fleet.id)
      .reduce((acc, r) => {
        const reason = r.cancellation_reason || 'expired_no_action';
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {})
  }));

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatNumber = (value) => {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
  };

  const tiles = [
    {
      id: 'total-fleets',
      title: 'Total Fleets',
      value: totalFleets,
      icon: Truck,
      color: colors.accent.primary,
      gradient: `colors.accent.primary`
    },
    {
      id: 'total-requests',
      title: 'Total Requests',
      value: totalRequests,
      icon: FileText,
      color: colors.accent.primary,
      gradient: `linear-gradient(135deg, ${colors.accent.primary} 0%, #ff8c42 100%)`
    },
    {
      id: 'requests-by-fleet',
      title: 'Requests by Fleet',
      value: `${requestsByFleet.length} fleets`,
      icon: TrendingUp,
      color: colors.accent.success,
      gradient: `colors.accent.success`
    },
    {
      id: 'completed-requests',
      title: 'Completed Requests',
      value: completedRequests.length,
      icon: CheckCircle,
      color: colors.accent.success,
      gradient: `colors.accent.success`
    },
    {
      id: 'revenue-metrics',
      title: 'Revenue Metrics',
      value: formatCurrency(totalRevenue),
      subtitle: `Avg: ${formatCurrency(avgRevenue)}`,
      icon: DollarSign,
      color: colors.accent.success,
      gradient: `colors.accent.success`
    },
    {
      id: 'out-of-route',
      title: 'Out of Route Miles',
      value: formatNumber(totalOutOfRoute),
      subtitle: `Avg: ${formatNumber(avgOutOfRoute)} mi`,
      icon: Navigation,
      color: colors.accent.primary,
      gradient: `linear-gradient(135deg, ${colors.accent.primary} 0%, #ff8c42 100%)`
    },
    {
      id: 'cancelled-requests',
      title: 'Cancelled Requests',
      value: cancelledRequests.length,
      icon: X,
      color: colors.accent.danger,
      gradient: `colors.accent.danger`
    },
    {
      id: 'cancellation-reasons',
      title: 'Cancellation Reasons',
      value: `${Object.keys(cancellationReasons).length} types`,
      icon: FileText,
      color: colors.accent.danger,
      gradient: `colors.accent.danger`
    },
    {
      id: 'expired-requests',
      title: 'Expired Requests',
      value: expiredRequests.length,
      icon: X,
      color: colors.text.tertiary,
      gradient: `linear-gradient(135deg, ${colors.text.tertiary} 0%, #666 100%)`
    }
  ];

  const renderDetailView = () => {
    if (!selectedView) return null;

    switch (selectedView) {
      case 'total-fleets':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: 800 }}>All Fleets</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${colors.border.secondary}` }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Fleet Name</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>MC Number</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Home</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Trucks</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Drivers</th>
                  </tr>
                </thead>
                <tbody>
                  {fleets.map(fleet => (
                    <tr key={fleet.id} style={{ borderBottom: `1px solid ${colors.border.primary}` }}>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{fleet.name}</td>
                      <td style={{ padding: '12px' }}>{fleet.mc_number || 'N/A'}</td>
                      <td style={{ padding: '12px' }}>{fleet.home_address || 'N/A'}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>{fleet.trucks?.length || 0}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>{fleet.drivers?.length || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'total-requests':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: 800 }}>All Requests</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${colors.border.secondary}` }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Request Name</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Fleet</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Datum Point</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: colors.text.secondary }}>Status</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Cancellation Reason</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(request => (
                    <tr key={request.id} style={{ borderBottom: `1px solid ${colors.border.primary}` }}>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{request.request_name}</td>
                      <td style={{ padding: '12px' }}>{request.fleets?.name || 'Unknown'}</td>
                      <td style={{ padding: '12px' }}>{request.datum_point}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{ padding: '4px 12px', background: request.status === 'completed' ? `${colors.accent.success}20` : request.status === 'cancelled' ? `${colors.accent.danger}20` : `${colors.accent.primary}20`, borderRadius: '12px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
                          {request.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: request.status === 'cancelled' ? colors.text.primary : colors.text.tertiary }}>
                        {request.status === 'cancelled' && request.cancellation_reason ? (
                          <span>
                            {request.cancellation_reason === 'accident' && 'ACCIDENT'}
                            {request.cancellation_reason === 'weather' && 'WEATHER'}
                            {request.cancellation_reason === 'illness' && 'ILLNESS'}
                            {request.cancellation_reason === 'returns' && 'RETURNS'}
                            {request.cancellation_reason === 'hours_of_service' && 'HOURS OF SERVICE'}
                            {request.cancellation_reason === 'no_load_avail' && 'NO LOAD AVAIL'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>{new Date(request.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'requests-by-fleet':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: 800 }}>Requests by Fleet</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${colors.border.secondary}` }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Fleet Name</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Total</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Completed</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Cancelled</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Expired</th>
                  </tr>
                </thead>
                <tbody>
                  {requestsByFleet.map(({ fleet, total, completed, cancelled, expired }) => (
                    <tr key={fleet.id} style={{ borderBottom: `1px solid ${colors.border.primary}` }}>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{fleet.name}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>{total}</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: colors.accent.success }}>{completed}</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: colors.accent.danger }}>{cancelled}</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: colors.text.tertiary }}>{expired}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'completed-requests':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: 800 }}>Completed Requests</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${colors.border.secondary}` }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Request Name</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Fleet</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Revenue</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Out of Route</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {completedRequests.map(request => (
                    <tr key={request.id} style={{ borderBottom: `1px solid ${colors.border.primary}` }}>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{request.request_name}</td>
                      <td style={{ padding: '12px' }}>{request.fleets?.name || 'Unknown'}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: colors.accent.success }}>{formatCurrency(parseFloat(request.revenue_amount) || 0)}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>{formatNumber(parseFloat(request.out_of_route_miles) || 0)} mi</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>{request.completed_at ? new Date(request.completed_at).toLocaleDateString() : 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'revenue-metrics':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: 800 }}>Revenue Metrics</h3>
            <div style={{ marginBottom: '32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div style={{ padding: '20px', background: colors.background.secondary, borderRadius: '12px', border: `1px solid ${colors.border.accent}` }}>
                <div style={{ fontSize: '13px', color: colors.text.secondary, marginBottom: '8px' }}>Total Revenue</div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: colors.accent.success }}>{formatCurrency(totalRevenue)}</div>
              </div>
              <div style={{ padding: '20px', background: colors.background.secondary, borderRadius: '12px', border: `1px solid ${colors.border.accent}` }}>
                <div style={{ fontSize: '13px', color: colors.text.secondary, marginBottom: '8px' }}>Average Revenue</div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: colors.accent.success }}>{formatCurrency(avgRevenue)}</div>
              </div>
              <div style={{ padding: '20px', background: colors.background.secondary, borderRadius: '12px', border: `1px solid ${colors.border.accent}` }}>
                <div style={{ fontSize: '13px', color: colors.text.secondary, marginBottom: '8px' }}>Completed Requests</div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: colors.text.primary }}>{completedRequests.length}</div>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${colors.border.secondary}` }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Request</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Fleet</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {completedRequests.map(request => (
                    <tr key={request.id} style={{ borderBottom: `1px solid ${colors.border.primary}` }}>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{request.request_name}</td>
                      <td style={{ padding: '12px' }}>{request.fleets?.name}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: colors.accent.success }}>{formatCurrency(parseFloat(request.revenue_amount) || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'out-of-route':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: 800 }}>Out of Route Miles</h3>
            <div style={{ marginBottom: '32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div style={{ padding: '20px', background: colors.background.secondary, borderRadius: '12px', border: `1px solid ${colors.border.accent}` }}>
                <div style={{ fontSize: '13px', color: colors.text.secondary, marginBottom: '8px' }}>Total Miles</div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: colors.accent.primary }}>{formatNumber(totalOutOfRoute)}</div>
              </div>
              <div style={{ padding: '20px', background: colors.background.secondary, borderRadius: '12px', border: `1px solid ${colors.border.accent}` }}>
                <div style={{ fontSize: '13px', color: colors.text.secondary, marginBottom: '8px' }}>Average Miles</div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: colors.accent.primary }}>{formatNumber(avgOutOfRoute)}</div>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${colors.border.secondary}` }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Request</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Fleet</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Out of Route</th>
                  </tr>
                </thead>
                <tbody>
                  {completedRequests.map(request => (
                    <tr key={request.id} style={{ borderBottom: `1px solid ${colors.border.primary}` }}>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{request.request_name}</td>
                      <td style={{ padding: '12px' }}>{request.fleets?.name}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{formatNumber(parseFloat(request.out_of_route_miles) || 0)} mi</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'cancelled-requests':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: 800 }}>Cancelled Requests</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${colors.border.secondary}` }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Request Name</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Fleet</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Reason</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Cancelled</th>
                  </tr>
                </thead>
                <tbody>
                  {cancelledRequests.map(request => (
                    <tr key={request.id} style={{ borderBottom: `1px solid ${colors.border.primary}` }}>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{request.request_name}</td>
                      <td style={{ padding: '12px' }}>{request.fleets?.name}</td>
                      <td style={{ padding: '12px' }}>{request.cancellation_reason || 'unknown'}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>{request.cancelled_at ? new Date(request.cancelled_at).toLocaleDateString() : 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'cancellation-reasons':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: 800 }}>Cancellation Reasons</h3>
            <div style={{ marginBottom: '32px' }}>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 700 }}>Overall Breakdown</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${colors.border.secondary}` }}>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Reason</th>
                      <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Count</th>
                      <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(cancellationReasons).map(([reason, count]) => (
                      <tr key={reason} style={{ borderBottom: `1px solid ${colors.border.primary}` }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{reason}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>{count}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>{((count / cancelledRequests.length) * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 700 }}>By Fleet</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${colors.border.secondary}` }}>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Fleet</th>
                      <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Total Cancelled</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancellationReasonsByFleet.filter(({ reasons }) => Object.keys(reasons).length > 0).map(({ fleet, reasons }) => (
                      <tr key={fleet.id} style={{ borderBottom: `1px solid ${colors.border.primary}` }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{fleet.name}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>{Object.values(reasons).reduce((a, b) => a + b, 0)}</td>
                        <td style={{ padding: '12px' }}>
                          {Object.entries(reasons).map(([reason, count]) => (
                            <span key={reason} style={{ display: 'inline-block', marginRight: '12px', fontSize: '13px' }}>
                              {reason}: {count}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 'expired-requests':
        return (
          <div>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: 800 }}>Expired Requests</h3>
            <div style={{ marginBottom: '32px' }}>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 700 }}>By Fleet</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${colors.border.secondary}` }}>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Fleet</th>
                      <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Total Expired</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expirationReasonsByFleet.filter(({ reasons }) => Object.keys(reasons).length > 0).map(({ fleet, reasons }) => (
                      <tr key={fleet.id} style={{ borderBottom: `1px solid ${colors.border.primary}` }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{fleet.name}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>{Object.values(reasons).reduce((a, b) => a + b, 0)}</td>
                        <td style={{ padding: '12px' }}>
                          {Object.entries(reasons).map(([reason, count]) => (
                            <span key={reason} style={{ display: 'inline-block', marginRight: '12px', fontSize: '13px' }}>
                              {reason}: {count}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 700 }}>All Expired Requests</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${colors.border.secondary}` }}>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Request Name</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Fleet</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: colors.text.secondary }}>Reason</th>
                      <th style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: colors.text.secondary }}>Expired</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiredRequests.map(request => (
                      <tr key={request.id} style={{ borderBottom: `1px solid ${colors.border.primary}` }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{request.request_name}</td>
                        <td style={{ padding: '12px' }}>{request.fleets?.name}</td>
                        <td style={{ padding: '12px' }}>{request.cancellation_reason || 'expired_no_action'}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>{request.expired_at ? new Date(request.expired_at).toLocaleDateString() : 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: colors.background.primary, padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', border: `4px solid ${colors.accent.primary}40`, borderTop: `4px solid ${colors.accent.primary}`, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: colors.text.secondary }}>Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.background.primary, color: colors.text.primary }}>
      {/* Header */}
      <header style={{ padding: '24px 32px', borderBottom: `1px solid ${colors.border.secondary}`, background: colors.background.overlay, backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Truck size={32} color={colors.accent.primary} strokeWidth={2.5} />
            <div>
              <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900, letterSpacing: '-0.02em', color: colors.accent.primary }}>BACKHAUL</h1>
              <p style={{ margin: 0, fontSize: '13px', color: colors.text.secondary, fontWeight: 500, letterSpacing: '0.05em' }}>SMART RETURN ROUTE OPTIMIZATION</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <HamburgerMenu currentView="fleet-reports" onNavigate={onMenuNavigate} />
            <AvatarMenu onNavigateToSettings={onNavigateToSettings} />
          </div>
        </div>
      </header>

      {/* Page Header */}
      <div style={{ padding: '24px 32px', background: colors.background.secondary, borderBottom: `1px solid ${colors.border.secondary}` }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: 900, color: colors.text.primary }}>Fleet Reports</h2>
          <p style={{ margin: 0, color: colors.text.secondary, fontSize: '15px' }}>Analytics and insights for your fleet operations</p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
        {!selectedView ? (
          /* Dashboard Tiles */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            {tiles.map(tile => {
              const Icon = tile.icon;
              return (
                <div key={tile.id} onClick={() => setSelectedView(tile.id)} style={{ background: colors.background.card, border: `2px solid ${colors.border.primary}`, borderRadius: '16px', padding: '24px', cursor: 'pointer', transition: 'all 0.2s', position: 'relative', overflow: 'hidden' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = tile.color; e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${tile.color}30`; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border.primary; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ position: 'absolute', top: 0, right: 0, width: '120px', height: '120px', background: tile.gradient, opacity: 0.1, borderRadius: '50%', transform: 'translate(40%, -40%)' }} />
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ marginBottom: '16px' }}>
                      <Icon size={40} color={tile.color} strokeWidth={2} />
                    </div>
                    <div style={{ fontSize: '13px', color: colors.text.secondary, marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {tile.title}
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 900, color: colors.text.primary, marginBottom: tile.subtitle ? '4px' : '0' }}>
                      {tile.value}
                    </div>
                    {tile.subtitle && (
                      <div style={{ fontSize: '14px', color: colors.text.secondary }}>
                        {tile.subtitle}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Detail View */
          <div>
            <button onClick={() => setSelectedView(null)} style={{ marginBottom: '24px', padding: '10px 20px', background: colors.background.secondary, border: `1px solid ${colors.border.accent}`, borderRadius: '8px', color: colors.text.primary, fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ← Back to Dashboard
            </button>
            <div style={{ background: colors.background.card, border: `1px solid ${colors.border.primary}`, borderRadius: '16px', padding: '32px' }}>
              {renderDetailView()}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
