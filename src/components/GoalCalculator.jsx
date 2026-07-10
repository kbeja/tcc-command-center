import { useState } from 'react';

function fmt$(n) {
  if (!n && n !== 0) return '—';
  return '$' + Number(n).toFixed(2);
}

export default function GoalCalculator({ liveProducts, totalMoRevenue, totalMoSales, avgOrderValue, conversionRate }) {
  const [target, setTarget] = useState('');

  const targetNum = parseFloat(target) || 0;
  const ordersNeeded = avgOrderValue && targetNum ? Math.ceil(targetNum / avgOrderValue) : null;
  const visitorsNeeded = ordersNeeded && conversionRate ? Math.ceil(ordersNeeded / (conversionRate / 100)) : null;
  const perListingNeeded = ordersNeeded && liveProducts.length ? (ordersNeeded / liveProducts.length).toFixed(1) : null;
  const gap = targetNum ? targetNum - (totalMoRevenue || 0) : null;

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 10 }}>Goal Calculator</div>
      <div style={{ border: 'var(--border)', borderRadius: 2, padding: 16, background: 'var(--warm-white)', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <label style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)', whiteSpace: 'nowrap' }}>Monthly revenue target</label>
          <div style={{ display: 'flex', alignItems: 'center', border: 'var(--border)', borderRadius: 2, overflow: 'hidden', flex: 1, maxWidth: 160 }}>
            <span style={{ padding: '8px 10px', fontSize: '0.85rem', background: 'var(--charcoal-faint)', color: 'var(--charcoal-soft)' }}>$</span>
            <input
              type="number"
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder="500"
              style={{ border: 'none', padding: '8px 10px', fontSize: '0.85rem', flex: 1, outline: 'none', background: 'transparent' }}
            />
          </div>
        </div>

        {targetNum > 0 && (
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 14 }}>
              To reach {fmt$(targetNum)}/month you need:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ paddingLeft: 12, borderLeft: '2px solid var(--dusty-rose)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 2 }}>
                  Based on avg order value ({avgOrderValue ? fmt$(avgOrderValue) : '—'})
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>
                  {ordersNeeded ? `→ ${ordersNeeded} orders per month` : '→ Enter avg order value to calculate'}
                </div>
              </div>

              <div style={{ paddingLeft: 12, borderLeft: '2px solid var(--dusty-rose)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 2 }}>
                  Based on conversion rate ({conversionRate ? conversionRate.toFixed(1) + '%' : '—'})
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>
                  {visitorsNeeded
                    ? `→ ${visitorsNeeded.toLocaleString()} visitors needed`
                    : '→ Import Etsy data to calculate'}
                </div>
              </div>

              <div style={{ paddingLeft: 12, borderLeft: '2px solid var(--dusty-rose)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginBottom: 2 }}>
                  Based on current listings ({liveProducts.length})
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>
                  {perListingNeeded ? `→ ${perListingNeeded} orders per listing per month` : '—'}
                </div>
              </div>

              <div style={{ marginTop: 4, paddingTop: 14, borderTop: 'var(--border)' }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Gap from current</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.82rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--charcoal-soft)' }}>Currently tracking</span>
                    <span>{totalMoRevenue ? fmt$(totalMoRevenue) + '/mo' : '~$0/month'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--charcoal-soft)' }}>Target</span>
                    <span>{fmt$(targetNum)}/mo</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                    <span style={{ color: gap > 0 ? 'var(--alert)' : 'var(--success)' }}>
                      {gap > 0 ? 'Gap' : 'Surplus'}
                    </span>
                    <span style={{ color: gap > 0 ? 'var(--alert)' : 'var(--success)' }}>
                      {gap !== null ? fmt$(Math.abs(gap)) + '/mo' : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!targetNum && (
          <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', opacity: 0.7 }}>
            Enter a target to see what it takes to get there.
          </div>
        )}
      </div>
    </div>
  );
}
