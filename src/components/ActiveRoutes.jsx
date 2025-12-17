import { useState, useEffect } from 'react';
import { Truck, MapPin, DollarSign, Navigation, TrendingUp } from '../icons';
import tmsRoutesData from '../data/tms_routes_data.json';

export const ActiveRoutes = ({ onSelectRouteForBackhaul }) => {
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
      case 'scheduled': return '#f59e0b';
      case 'in_transit': return '#3b82f6';
      case 'completed': return '#10b981';
      default: return '#6b7280';
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
          <div style={{ fontSize: '14px', color: '#8b92a7', marginBottom: '8px' }}>Total Routes</div>
          <div style={{ fontSize: '32px', fontWeight: 900, color: '#3b82f6' }}>{totalRoutes}</div>
        </div>

        <div style={{
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ fontSize: '14px', color: '#8b92a7', marginBottom: '8px' }}>In Transit</div>
          <div style={{ fontSize: '32px', fontWeight: 900, color: '#f59e0b' }}>{inTransit}</div>
        </div>

        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ fontSize: '14px', color: '#8b92a7', marginBottom: '8px' }}>Completed</div>
          <div style={{ fontSize: '32px', fontWeight: 900, color: '#10b981' }}>{completed}</div>
        </div>

        <div style={{
          background: 'rgba(0, 212, 255, 0.1)',
          border: '1px solid rgba(0, 212, 255, 0.3)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ fontSize: '14px', color: '#8b92a7', marginBottom: '8px' }}>Total Revenue</div>
          <div style={{ fontSize: '32px', fontWeight: 900, color: '#00d4ff' }}>
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
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: '#e8eaed',
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
                background: filterStatus === status ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: filterStatus === status ? '1px solid rgba(0, 212, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: filterStatus === status ? '#00d4ff' : '#8b92a7',
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
        background: 'rgba(26, 31, 58, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '24px'
      }}>
        <h3 style={{
          margin: '0 0 20px 0',
          fontSize: '20px',
          fontWeight: 800,
          color: '#e8eaed'
        }}>
          Active Routes ({filteredRoutes.length})
        </h3>

        {filteredRoutes.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#8b92a7'
          }}>
            <Truck size={48} color="#6b7280" style={{ marginBottom: '16px' }} />
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
                  background: 'rgba(26, 31, 58, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '20px',
                  alignItems: 'center',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(26, 31, 58, 0.8)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(26, 31, 58, 0.6)'}
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
                      color: '#e8eaed',
                      fontFamily: "'JetBrains Mono', monospace"
                    }}>
                      {route.truck_name}
                    </div>
                    <div style={{ fontSize: '14px', color: '#8b92a7' }}>
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
                    color: '#8b92a7'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MapPin size={16} color="#10b981" />
                      <strong>Origin:</strong>
                    </div>
                    <div>{route.origin_city}</div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Navigation size={16} color="#f59e0b" />
                      <strong>Destination:</strong>
                    </div>
                    <div>{route.dest_city} ({route.dest_customer})</div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <TrendingUp size={16} color="#3b82f6" />
                      <strong>Distance:</strong>
                    </div>
                    <div>{route.distance_miles} miles</div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <DollarSign size={16} color="#00d4ff" />
                      <strong>Revenue:</strong>
                    </div>
                    <div>
                      ${route.estimated_revenue.toFixed(2)} 
                      <span style={{ color: '#6b7280' }}> (${route.revenue_per_mile}/mile)</span>
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
                        background: 'linear-gradient(135deg, #ff6b35 0%, #ff8c5a 100%)',
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
                    color: '#6b7280',
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
