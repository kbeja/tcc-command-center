import { NavLink } from 'react-router-dom';

export default function Nav({ workshopCount, moSales, moRevenue }) {
  const fmt$ = n => n != null ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : null;
  const hasPulse = moSales > 0 || moRevenue > 0;
  return (
    <nav className="bottom-nav">
      <span className="nav-brand" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
        <span>TCC</span>
        {hasPulse && (
          <span style={{ fontSize: '0.55rem', color: 'var(--charcoal-soft)', fontWeight: 400, whiteSpace: 'nowrap', lineHeight: 1.2 }}>
            {moSales}x · {fmt$(moRevenue)}
          </span>
        )}
      </span>
      <NavLink to="/" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} end>
        <span className="nav-icon">🏠</span>
        <span>Home</span>
      </NavLink>
      <NavLink to="/products" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <span className="nav-icon">📦</span>
        <span>Products</span>
      </NavLink>
      <NavLink to="/sparks" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <span className="nav-icon">💡</span>
        <span>Idea Vault</span>
      </NavLink>
      <NavLink to="/research" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <span className="nav-icon">🔬</span>
        <span>Research</span>
      </NavLink>
      <NavLink to="/workshop" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <span className="nav-icon">🔨</span>
        <span>Workshop</span>
        {workshopCount > 0 && <span className="nav-badge">{workshopCount}</span>}
      </NavLink>
      <NavLink to="/analytics" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <span className="nav-icon">📊</span>
        <span>Analytics</span>
      </NavLink>
      <NavLink to="/trends" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <span className="nav-icon">📡</span>
        <span>Trends</span>
      </NavLink>
      <NavLink to="/collections" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <span className="nav-icon">📚</span>
        <span>Collections</span>
      </NavLink>
      <NavLink to="/knowledge" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <span className="nav-icon">🧠</span>
        <span>Knowledge</span>
      </NavLink>
      <NavLink to="/listing-builder" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <span className="nav-icon">✍</span>
        <span>Listing</span>
      </NavLink>
      <NavLink to="/studio" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <span className="nav-icon">🎨</span>
        <span>Studio</span>
      </NavLink>
    </nav>
  );
}
