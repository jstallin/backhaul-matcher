import { useState, useEffect } from 'react';
import { Truck, MapPin, DollarSign, Navigation, TrendingUp } from '../icons';
import { useTheme } from '../contexts/ThemeContext';
import tmsRoutesData from '../data/tms_routes_data.json';

export const ActiveRoutes = ({ onSelectRouteForBackhaul }) => {
  const { colors } = useTheme();
  const [routes, setRoutes] = useState([]);
  const [filteredRoutes, setFilteredRoutes] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Load TMS routes data
    setRoutes(tmsRoutesData);
    setFilteredRoutes(tmsRoutesData);
  }, []);

  useEffect(() => {
    // Filter routes based on status and search
    let filtered = routes;

    if (filterStatus !== 'all') {
      filtered = filtered.filter(r => r.status === filterStatus);
    }

    if (searchTerm) {
      filtered = filtered.filter(r => 
        r.truck_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.driver_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.dest_city.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredRoutes(filtered);
  }, [filterStatus, searchTerm, routes]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled': return '${colors.accent.yellow}';
      case 'in_transit': return '${colors.accent.blue}';
      case 'completed': return '${colors.accent.green}';
      default: return '${colors.text.tertiary}';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'scheduled': return 'Scheduled';
      case 'in_transit': return 'In Transit';
      case 'completed': return 'Completed';
      default: return status;
    }
  };

  // Calculate summary stats
  const totalRoutes = routes.length;
  const inTransit = routes.filter(r => r.status === 'in_transit').length;
  const completed = routes.filter(r => r.status === 'completed').length;
  const totalRevenue = routes.reduce((sum, r) => sum + r.estimated_revenue, 0);
  const totalMiles = routes.reduce((sum, r) => sum + r.distance_miles, 0);

  return (
    <div style={{ padding: '20px 0' }}>
      {/* Summary Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div style={{
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ fontSize: '14px', color: '${colors.text.secondary}', marginBottom: '8px' }}>Total Routes</div>
          <div style={{ fontSize: '32px', fontWeight: 900, color: '${colors.accent.blue}' }}>{totalRoutes}</div>
        </div>

        <div style={{
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ fontSize: '14px', color: '${colors.text.secondary}', marginBottom: '8px' }}>In Transit</div>
          <div style={{ fontSize: '32px', fontWeight: 900, color: '${colors.accent.yellow}' }}>{inTransit}</div>
        </div>

        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ fontSize: '14px', color: '${colors.text.secondary}', marginBottom: '8px' }}>Completed</div>
          <div style={{ fontSize: '32px', fontWeight: 900, color: '${colors.accent.green}' }}>{completed}</div>
        </div>

        <div style={{
          background: 'rgba(0, 212, 255, 0.1)',
          border: '1px solid rgba(0, 212, 255, 0.3)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ fontSize: '14px', color: '${colors.text.secondary}', marginBottom: '8px' }}>Total Revenue</div>
          <div style={{ fontSize: '32px', fontWeight: 900, color: '${colors.accent.cyan}' }}>
            ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search by truck, driver, or destination..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            minWidth: '250px',
            padding: '12px 16px',
            background: '${colors.background.tertiary}',
            border: '1px solid ${colors.border.primary}',
            borderRadius: '8px',
            color: '${colors.text.primary}',
            fontSize: '14px',
            outline: 'none'
          }}
        />

        {/* Status Filter */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {['all', 'scheduled', 'in_transit', 'completed'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                padding: '12px 20px',
                background: filterStatus === status ? 'rgba(0, 212, 255, 0.2)' : '${colors.background.tertiary}',
                border: filterStatus === status ? '1px solid rgba(0, 212, 255, 0.4)' : '1px solid ${colors.border.primary}',
                borderRadius: '8px',
                color: filterStatus === status ? '${colors.accent.cyan}' : '${colors.text.secondary}',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {status === 'all' ? 'All' : getStatusLabel(status)}
            </button>
          ))}
        </div>
      </div>

      {/* Routes List */}
      <div style={{
        background: '${colors.background.tertiary}',
        border: '1px solid ${colors.border.primary}',
        borderRadius: '16px',
        padding: '24px'
      }}>
        <h3 style={{
          margin: '0 0 20px 0',
          fontSize: '20px',
          fontWeight: 800,
          color: '${colors.text.primary}'
        }}>
          Active Routes ({filteredRoutes.length})
        </h3>

        {filteredRoutes.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '${colors.text.secondary}'
          }}>
            <Truck size={48} color="${colors.text.tertiary}" style={{ marginBottom: '16px' }} />
            <p>No routes match your filters</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gap: '12px',
            maxHeight: '600px',
            overflowY: 'auto',
            paddingRight: '8px'
          }}>
            {filteredRoutes.map((route) => (
              <div
                key={route.route_id}
                style={{
                  background: '${colors.background.secondary}',
                  border: '1px solid ${colors.border.primary}',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '20px',
                  alignItems: 'center',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '${colors.background.hover}'}
                onMouseLeave={(e) => e.currentTarget.style.background = '${colors.background.secondary}'}
              >
                <div>
                  {/* Header */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '12px'
                  }}>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: 800,
                      color: '${colors.text.primary}',
                      fontFamily: "'JetBrains Mono', monospace"
                    }}>
                      {route.truck_name}
                    </div>
                    <div style={{ fontSize: '14px', color: '${colors.text.secondary}' }}>
                      • {route.driver_name}
                    </div>
                    <div style={{
                      padding: '4px 12px',
                      background: `${getStatusColor(route.status)}20`,
                      border: `1px solid ${getStatusColor(route.status)}40`,
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: getStatusColor(route.status)
                    }}>
                      {getStatusLabel(route.status)}
                    </div>
                  </div>

                  {/* Route Info */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: '12px 20px',
                    fontSize: '14px',
                    color: '${colors.text.secondary}'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MapPin size={16} color="${colors.accent.green}" />
                      <strong>Origin:</strong>
                    </div>
                    <div>{route.origin_city}</div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Navigation size={16} color="${colors.accent.yellow}" />
                      <strong>Destination:</strong>
                    </div>
                    <div>{route.dest_city} ({route.dest_customer})</div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <TrendingUp size={16} color="${colors.accent.blue}" />
                      <strong>Distance:</strong>
                    </div>
                    <div>{route.distance_miles} miles</div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <DollarSign size={16} color="${colors.accent.cyan}" />
                      <strong>Revenue:</strong>
                    </div>
                    <div>
                      ${route.estimated_revenue.toFixed(2)} 
                      <span style={{ color: '${colors.text.tertiary}' }}> (${route.revenue_per_mile}/mile)</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {route.status === 'in_transit' && (
                    <button
                      onClick={() => onSelectRouteForBackhaul && onSelectRouteForBackhaul(route)}
                      style={{
                        padding: '10px 20px',
                        background: 'linear-gradient(135deg, ${colors.accent.orange} 0%, #ff8c5a 100%)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Find Backhaul
                    </button>
                  )}
                  <div style={{
                    fontSize: '11px',
                    color: '${colors.text.tertiary}',
                    textAlign: 'center'
                  }}>
                    {route.equipment_type === 'TV' ? 'Dry Van' : 'Flatbed'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
