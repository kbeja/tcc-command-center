export default function ConfidenceSelector({ value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span className="form-label" style={{ margin: 0 }}>Confidence</span>
      <div className="toggle-group">
        {['High', 'Medium', 'Low'].map(level => (
          <button
            key={level}
            className={`toggle-btn${value === level ? ' active' : ''}`}
            onClick={() => onChange(level)}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  );
}
