import { CopyButton, SectionHeader } from './shared';

// Zone 3 — Images tab (Milestone B). Existing prompt cards (unchanged) plus
// a read-only echo of Zone 1's design image — Zone 1 stays the authoritative
// edit surface (upload/replace/re-analyze); this is display only, same
// pattern as Primary Search Intent's echo on the Listing tab.
export default function Zone3Images({ imagePreview, imageAnalysis, editPrompts, onPromptsChange }) {
  return (
    <div>
      {(imagePreview || imageAnalysis) && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(43,41,38,0.08)' }}>
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Design mockup"
              style={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 4, border: '1px solid rgba(43,41,38,0.12)', background: '#f5f3f0', flexShrink: 0 }}
            />
          )}
          {imageAnalysis && (
            <div style={{ fontSize: '0.76rem', color: 'var(--charcoal-soft)', lineHeight: 1.6 }}>{imageAnalysis}</div>
          )}
        </div>
      )}

      {editPrompts.length > 0 && <SectionHeader title="ChatGPT Image Prompts" />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {editPrompts.map((p, i) => (
          <div key={i} style={{ background: 'var(--warm-white)', borderRadius: 4, padding: '12px 14px', border: '1px solid rgba(43,41,38,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--charcoal-soft)' }}>
                {p.slot}. {p.type}
              </div>
              <CopyButton text={p.prompt} />
            </div>
            <textarea
              value={p.prompt}
              onChange={e => {
                const arr = [...editPrompts];
                arr[i] = { ...arr[i], prompt: e.target.value };
                onPromptsChange(arr);
              }}
              rows={3}
              style={{ width: '100%', fontSize: '0.82rem', lineHeight: 1.6 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
