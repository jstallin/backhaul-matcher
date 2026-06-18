// #163: shared "Saved loads" table + per-row actions (View / Haul / Contact Broker).
// One component for v1 + v2; host passes a palette to match the theme. Reads saved_loads,
// shows status "Saved", and reuses the existing haul completion + broker-contact patterns.
import { useState, useEffect, useRef } from 'react';
import { db } from '../lib/supabase';
import { Package, TrendingUp, Phone, X, CheckCircle } from '../icons';
import { ContactBrokerDialog } from './ContactBrokerDialog';

const money = (v) => (v == null || v === '' ? '—' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }));
const miles = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' mi');
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const routeOf = (r) => `${[r.origin_city, r.origin_state].filter(Boolean).join(', ') || '—'} → ${[r.destination_city, r.destination_state].filter(Boolean).join(', ') || '—'}`;

// Per-row action dropdown (mirrors the LoadShareMenu popover: outside-click closes).
function RowActions({ row, p, onView, onHaul, onContact }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const item = { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: p.text, textAlign: 'left', whiteSpace: 'nowrap' };
  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button onClick={() => setOpen(o => !o)} aria-label="Load actions" style={{ padding: '6px 10px', background: 'none', border: `1px solid ${p.border}`, borderRadius: '8px', cursor: 'pointer', color: p.text, fontSize: '16px', lineHeight: 1, fontWeight: 700 }}>⋯</button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: p.cardBg, border: `1px solid ${p.border}`, borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 30000, minWidth: '170px', overflow: 'hidden' }}>
          <button style={item} onClick={() => { setOpen(false); onView(row); }}><Package size={15} color={p.accent} /> View</button>
          <button style={item} onClick={() => { setOpen(false); onHaul(row); }}><TrendingUp size={15} color={p.accent} /> Haul</button>
          <button style={item} onClick={() => { setOpen(false); onContact(row); }}><Phone size={15} color={p.accent} /> Contact Broker</button>
        </div>
      )}
    </div>
  );
}

export function SavedLoadsPanel({ userId, palette = {}, emptyHint }) {
  const p = { accent: '#2563eb', text: '#0f172a', textMuted: '#64748b', border: '#e2e8f0', cardBg: '#ffffff', bg: '#f8fafc', green: '#16a34a', ...palette };
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewRow, setViewRow] = useState(null);
  const [contactRow, setContactRow] = useState(null);
  const [haulRow, setHaulRow] = useState(null);
  const [haulBusy, setHaulBusy] = useState(false);

  const load = () => {
    if (!userId) return;
    setLoading(true);
    db.savedLoads.getAll(userId)
      .then(data => setRows((data || []).filter(r => r.status === 'saved')))
      .catch(err => console.error('SavedLoadsPanel fetch error:', err.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [userId]);

  const removeRow = async (row) => {
    try { await db.savedLoads.delete(row.id); setRows(rs => rs.filter(r => r.id !== row.id)); }
    catch (err) { console.error('Remove saved load failed:', err.message); }
  };

  // Haul = reuse the existing request completion flow when the save is tied to a request.
  const confirmHaul = async () => {
    if (!haulRow) return;
    setHaulBusy(true);
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    try {
      if (haulRow.request_id) {
        await db.requests.update(haulRow.request_id, {
          status: 'completed',
          revenue_amount: num(haulRow.revenue_amount),
          net_revenue: num(haulRow.net_revenue),
          out_of_route_miles: num(haulRow.out_of_route_miles),
          load_distance_miles: num(haulRow.distance_miles) || null,
          hauled_load_id: haulRow.load_id || null,
          hauled_load_source: haulRow.source || null,
          completed_at: new Date().toISOString(),
        });
      }
      await db.savedLoads.updateStatus(haulRow.id, 'hauled');
      setRows(rs => rs.filter(r => r.id !== haulRow.id));
      setHaulRow(null);
    } catch (err) {
      console.error('Haul from saved load failed:', err.message);
    } finally {
      setHaulBusy(false);
    }
  };

  const th = { padding: '10px 16px', fontSize: '12px', fontWeight: 600, color: p.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', whiteSpace: 'nowrap' };
  const td = { padding: '14px 16px', fontSize: '14px', color: p.text, verticalAlign: 'middle' };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: p.textMuted }}>Loading saved loads…</div>;

  if (rows.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 0', color: p.textMuted }}>
        <Package size={36} style={{ opacity: 0.4, marginBottom: '10px' }} />
        <div style={{ fontSize: '15px', fontWeight: 600 }}>No saved loads</div>
        <div style={{ fontSize: '13px', marginTop: '4px', opacity: 0.7 }}>{emptyHint || 'Save a load from the search results to see it here.'}</div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: p.bg, borderBottom: `1px solid ${p.border}` }}>
            <th style={th}>Saved</th>
            <th style={th}>Route</th>
            <th style={th}>Broker</th>
            <th style={{ ...th, textAlign: 'right' }}>Revenue</th>
            <th style={{ ...th, textAlign: 'right' }}>Net Revenue</th>
            <th style={th}>Status</th>
            <th style={{ ...th, textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id} style={{ borderBottom: idx === rows.length - 1 ? 'none' : `1px solid ${p.border}` }}>
              <td style={{ ...td, whiteSpace: 'nowrap', color: p.textMuted }}>{fmtDate(row.created_at)}</td>
              <td style={{ ...td, fontWeight: 600 }}>{routeOf(row)}</td>
              <td style={{ ...td, maxWidth: '180px' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.company_name || '—'}</div></td>
              <td style={{ ...td, textAlign: 'right' }}>{money(row.revenue_amount)}</td>
              <td style={{ ...td, textAlign: 'right', color: p.green, fontWeight: 600 }}>{money(row.net_revenue)}</td>
              <td style={td}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '999px', background: `${p.accent}14`, color: p.accent, fontSize: '12px', fontWeight: 600 }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: p.accent }} /> Saved
                </span>
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <RowActions row={row} p={p} onView={setViewRow} onHaul={setHaulRow} onContact={setContactRow} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* View — saved snapshot detail */}
      {viewRow && (
        <div onClick={() => setViewRow(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 30000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: p.cardBg, borderRadius: '14px', width: '100%', maxWidth: '440px', padding: '22px', border: `1px solid ${p.border}`, boxShadow: '0 16px 48px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: p.text }}>Saved Load</div>
              <button onClick={() => setViewRow(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.textMuted, padding: '4px' }}><X size={16} /></button>
            </div>
            {[
              ['Route', routeOf(viewRow)],
              ['Broker', viewRow.company_name || '—'],
              ['Shipper', viewRow.shipper || '—'],
              ['Freight', viewRow.freight_type || '—'],
              ['Equipment', viewRow.equipment_type || '—'],
              ['Pickup', fmtDate(viewRow.pickup_date)],
              ['Revenue', money(viewRow.revenue_amount)],
              ['Net Revenue', money(viewRow.net_revenue)],
              ['Load Miles', miles(viewRow.distance_miles)],
              ['Out-of-Route', miles(viewRow.out_of_route_miles)],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${p.border}`, fontSize: '14px' }}>
                <span style={{ color: p.textMuted }}>{label}</span>
                <span style={{ color: p.text, fontWeight: 600, textAlign: 'right' }}>{val}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
              <button onClick={() => { setViewRow(null); setHaulRow(viewRow); }} style={{ flex: 1, padding: '11px', background: p.green, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Haul</button>
              <button onClick={() => { setViewRow(null); setContactRow(viewRow); }} style={{ flex: 1, padding: '11px', background: 'none', border: `1px solid ${p.border}`, borderRadius: '8px', color: p.text, fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Contact Broker</button>
            </div>
          </div>
        </div>
      )}

      {/* Contact Broker */}
      <ContactBrokerDialog
        open={!!contactRow}
        onClose={() => setContactRow(null)}
        phone={contactRow?.contact_phone}
        email={contactRow?.contact_email}
        broker={contactRow?.company_name}
        palette={p}
      />

      {/* Haul confirm */}
      {haulRow && (
        <div onClick={() => !haulBusy && setHaulRow(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 30000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: p.cardBg, borderRadius: '14px', width: '100%', maxWidth: '400px', padding: '22px', border: `1px solid ${p.border}`, boxShadow: '0 16px 48px rgba(0,0,0,0.35)' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: p.text, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><TrendingUp size={18} color={p.green} /> Haul This Load</div>
            <div style={{ fontSize: '14px', color: p.textMuted, marginBottom: '6px' }}>{routeOf(haulRow)}</div>
            <div style={{ fontSize: '13px', color: p.textMuted, marginBottom: '18px' }}>
              Net revenue <strong style={{ color: p.green }}>{money(haulRow.net_revenue)}</strong>.
              {haulRow.request_id ? ' This completes the originating request and records the hauled load.' : ' This marks the saved load as hauled.'}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setHaulRow(null)} disabled={haulBusy} style={{ padding: '9px 16px', background: 'none', border: `1px solid ${p.border}`, borderRadius: '8px', color: p.textMuted, fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmHaul} disabled={haulBusy} style={{ padding: '9px 18px', background: p.green, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: haulBusy ? 'wait' : 'pointer', opacity: haulBusy ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                {haulBusy ? 'Hauling…' : (<><CheckCircle size={15} /> Confirm Haul</>)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
