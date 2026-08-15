import { useState } from 'react';
import { DESC_META, INTENT_STATUS_STYLE } from './constants';
import { CopyButton, SectionHeader } from './shared';
import Zone3Description from './Zone3Description';
import Zone3Images from './Zone3Images';
import Zone3Research from './Zone3Research';

// Zone 3 — Listing (Milestone B). Tab bar owned locally (activeTab, default
// 'listing', not lifted, not persisted) — copies the underline-tab pattern
// from ConceptWorkspace.jsx/CollectionDetail.jsx/Knowledge.jsx verbatim,
// not the separate btn-group filter-button pattern used elsewhere for a
// different kind of switching. Also the hub for the 3 sibling panels
// (Description/Images/Research) since "Listing" is the default tab.
export default function Zone3Listing({
  editTitle, onTitleChange, editTags, onTagsChange,
  primarySearchIntent, primaryIntentStatus,
  form, editDesc, onDescChange,
  imagePreview, imageAnalysis, editPrompts, onPromptsChange,
  supportingKeywords, researchGaps, excludedKeywords, sources,
}) {
  const [activeTab, setActiveTab] = useState('listing');

  const tabs = [
    ['listing', 'Listing'],
    ['description', 'Description'],
    ['images', `Images${editPrompts.length ? ` (${editPrompts.length})` : ''}`],
    ['research', `Research${researchGaps.length ? ` (${researchGaps.length})` : ''}`],
  ];

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(43,41,38,0.12)', marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: activeTab === key ? 600 : 400,
              color: activeTab === key ? 'var(--warm-charcoal)' : 'var(--charcoal-soft)',
              borderBottom: activeTab === key ? '2px solid var(--warm-charcoal)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'listing' && (
        <div>
          <SectionHeader title="Title" />
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <input
                value={editTitle}
                onChange={e => onTitleChange(e.target.value)}
                style={{ width: '100%', fontSize: '0.9rem', fontFamily: 'var(--font-display)' }}
                maxLength={140}
              />
              <div style={{ fontSize: '0.7rem', color: editTitle.length > 130 ? '#c97b7b' : 'var(--charcoal-soft)', marginTop: 4 }}>
                {editTitle.length}/140 characters
              </div>
            </div>
            <CopyButton text={editTitle} />
          </div>

          <SectionHeader title={`Tags (${editTags.length}/13)`} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <CopyButton text={editTags.join(', ')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
            {editTags.map((tag, i) => {
              const len = tag.length;
              const countColor = len === 20 ? '#c97b7b' : len >= 17 ? '#E8A87C' : 'var(--charcoal-soft)';
              return (
                <div key={i} style={{ position: 'relative' }}>
                  <input
                    value={tag}
                    onChange={e => { const t = [...editTags]; t[i] = e.target.value; onTagsChange(t); }}
                    style={{ width: '100%', fontSize: '0.78rem', paddingRight: 28 }}
                    maxLength={20}
                    placeholder={`Tag ${i + 1}`}
                  />
                  <span style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    fontSize: '0.6rem', color: countColor, fontWeight: 600, pointerEvents: 'none',
                  }}>{len}</span>
                </div>
              );
            })}
            {editTags.length < 13 && (
              <button className="btn btn-ghost btn-sm" onClick={() => onTagsChange([...editTags, ''])}>+ Add tag</button>
            )}
          </div>

          {/* Primary Search Intent — read-only echo. Zone 2 (Search
              Strategy) is the authoritative edit surface; editing it lives
              there, not here. */}
          {primarySearchIntent && (
            <div style={{ marginTop: 20 }}>
              <label className="form-label">
                Primary Search Intent
                {primaryIntentStatus && INTENT_STATUS_STYLE[primaryIntentStatus] && (
                  <span style={{
                    marginLeft: 8, fontSize: '0.65rem', padding: '1px 7px', borderRadius: 10, textTransform: 'capitalize',
                    background: INTENT_STATUS_STYLE[primaryIntentStatus].bg, color: INTENT_STATUS_STYLE[primaryIntentStatus].color,
                  }}>
                    {primaryIntentStatus}
                  </span>
                )}
              </label>
              <div style={{ fontSize: '0.82rem', color: 'var(--charcoal-soft)' }}>{primarySearchIntent}</div>
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <CopyButton text={[
              `TITLE\n${editTitle}`,
              `TAGS\n${editTags.filter(Boolean).join(', ')}`,
              ...Object.entries(DESC_META).map(([k, m]) => `${m.label.toUpperCase()}\n${editDesc[k] || ''}`),
            ].join('\n\n')} />
            <span style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', marginLeft: 8 }}>Copy full listing</span>
          </div>
        </div>
      )}

      {activeTab === 'description' && (
        <Zone3Description form={form} editDesc={editDesc} onChange={onDescChange} />
      )}

      {activeTab === 'images' && (
        <Zone3Images imagePreview={imagePreview} imageAnalysis={imageAnalysis} editPrompts={editPrompts} onPromptsChange={onPromptsChange} />
      )}

      {activeTab === 'research' && (
        <Zone3Research supportingKeywords={supportingKeywords} researchGaps={researchGaps} excludedKeywords={excludedKeywords} sources={sources} />
      )}
    </div>
  );
}
