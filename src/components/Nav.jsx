import { NavLink } from 'react-router-dom';

export default function Nav({ workshopCount }) {
  return (
    <nav className="bottom-nav">
      <span className="nav-brand">TCC</span>
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
    </nav>
  );
}
