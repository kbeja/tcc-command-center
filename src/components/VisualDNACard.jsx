import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ConfidenceBadge } from '../lib/keywords';
import { TAXONOMY_CATEGORIES, CATEGORY_LABELS } from '../lib/visualTaxonomy';
import VisualTagPicker from './VisualTagPicker';

async function getSnapshotUrl(path) {
  if (!path) return null;
  const { data } = await supabase.storage.from('competitor-visual-snapshots').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

// Most design_profile/mockup_profile fields are stored as {value, confidence}
// (see analyze-visual.js's valueConfidencePair()) — a few (audience_cues,
// distinctive_characteristics, palette) aren't, since they're arrays/free
// text with no single value to attach one confidence number to.
function attr(profileJson, key) {
  const v = profileJson?.[key];
  if (v == null) return null;
  if (typeof v === 'object' && !Array.isArray(v) && 'value' in v) return v;
  return { value: v, confidence: null };
}

function AttrRow({ label, entry }) {
  if (!entry || entry.value == null || entry.value === '') return null;
  const display = typeof entry.value === 'boolean' ? (entry.value ? 'Yes' : 'No') : String(entry.value);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.75rem', padding: '2px 0' }}>
      <span style={{ color: 'var(--charcoal-soft)' }}>{label}</span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center', textAlign: 'right' }}>
        {display}
        {entry.confidence && <ConfidenceBadge confidence={entry.confidence} />}
      </span>
    </div>
  );
}

// One taxonomy category's applied tags, read-only — a trailing "?" flags a
// Low-confidence tag inline rather than a separate badge per tag, so a row
// of 4-5 tags doesn't turn into a wall of badges.
function TagRow({ label, tags }) {
  if (!tags.length) return <div style={{ fontSize: '0.75rem', padding: '2px 0', color: 'var(--charcoal-soft)', opacity: 0.5 }}>{label}: —</div>;
  return (
    <div style={{ fontSize: '0.75rem', padding: '2px 0' }}>
      <span style={{ color: 'var(--charcoal-soft)' }}>{label}: </span>
      {tags.map((t, i) => (
        <span key={t.tag_id} title={t.confidence ? `Confidence: ${t.confidence}` : undefined}>
          {t.visual_tags?.name}{t.confidence === 'Low' ? ' ?' : ''}{i < tags.length - 1 ? ', ' : ''}
        </span>
      ))}
    </div>
  );
}

// A single listing's current Visual Profile ("Visual DNA," Kristen's own
// term for this). `profile` is one row from useVisualProfilesByListing()'s
// grouped map — a visual_profiles row with competitor_listing_tags embedded.
// Read-only unless `editable` — pass allTags + onAddTag/onRemoveTag to let a
// human correct an AI-assigned tag via the existing VisualTagPicker, one
// instance per category (it's a flat single-list picker; this taxonomy has
// five categories, so it's called five times rather than rewritten).
export default function VisualDNACard({ profile, allTags = [], onAddTag, onRemoveTag, editable = false }) {
  const [snapshotUrl, setSnapshotUrl] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setSnapshotUrl(null);
    getSnapshotUrl(profile?.snapshot_storage_path).then(url => { if (!cancelled) setSnapshotUrl(url); });
    return () => { cancelled = true; };
  }, [profile?.snapshot_storage_path]);

  if (!profile) {
    return <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', fontStyle: 'italic' }}>Not yet analyzed.</div>;
  }

  if (profile.status !== 'complete') {
    const label = profile.status === 'image_unavailable' ? 'Image unavailable' : 'Analysis failed';
    return (
      <div style={{ fontSize: '0.78rem', color: 'var(--alert)' }}>
        ⚠ {label}{profile.failure_reason ? ` — ${profile.failure_reason}` : ''}
      </div>
    );
  }

  const tagsByCategory = {};
  for (const t of profile.competitor_listing_tags || []) {
    (tagsByCategory[t.category] ||= []).push(t);
  }
  const design = profile.design_profile || {};
  const mockup = profile.mockup_profile || {};

  return (
    <div style={{ border: 'var(--border)', borderRadius: 4, padding: 14, background: 'var(--warm-white)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="eyebrow">Visual DNA</div>
        <ConfidenceBadge confidence={profile.design_confidence} />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        {snapshotUrl && (
          <img src={snapshotUrl} alt="Analyzed snapshot" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {TAXONOMY_CATEGORIES.map(cat => (
            <div key={cat} style={{ marginBottom: 3 }}>
              <TagRow label={CATEGORY_LABELS[cat]} tags={tagsByCategory[cat] || []} />
              {editable && (
                editingCategory === cat ? (
                  <VisualTagPicker
                    allTags={allTags}
                    appliedTags={(tagsByCategory[cat] || []).map(t => ({ id: t.tag_id, name: t.visual_tags?.name }))}
                    onAdd={tag => onAddTag(cat, tag)}
                    onRemove={tag => onRemoveTag(cat, tag)}
                  />
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: '0.62rem', padding: '0 4px' }} onClick={() => setEditingCategory(cat)}>
                    edit
                  </button>
                )
              )}
            </div>
          ))}
          {design.distinctive_characteristics && (
            <div style={{ fontSize: '0.72rem', color: 'var(--charcoal-soft)', fontStyle: 'italic', marginTop: 4 }}>
              {design.distinctive_characteristics}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(43,41,38,0.08)' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Design</div>
          {design.palette?.dominant_colors?.length > 0 && (
            <div style={{ fontSize: '0.75rem', padding: '2px 0' }}>
              <span style={{ color: 'var(--charcoal-soft)' }}>Palette: </span>
              {design.palette.dominant_colors.join(' / ')}
            </div>
          )}
          <AttrRow label="Balance" entry={attr(design, 'text_to_graphic_balance')} />
          <AttrRow label="Density" entry={attr(design, 'visual_density')} />
          <AttrRow label="Style lead" entry={attr(design, 'phrase_vs_illustration_led')} />
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
            Mockup <ConfidenceBadge confidence={profile.mockup_confidence} />
          </div>
          <AttrRow label="Type" entry={attr(mockup, 'mockup_type')} />
          <AttrRow label="Presentation" entry={attr(mockup, 'presentation_style')} />
          <AttrRow label="Garment color" entry={attr(mockup, 'garment_color')} />
        </div>
      </div>

      {profile.analysis_notes && (
        <div style={{ fontSize: '0.7rem', color: 'var(--charcoal-soft)', fontStyle: 'italic', marginTop: 8 }}>
          {profile.analysis_notes}
        </div>
      )}

      <div style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', opacity: 0.7, marginTop: 8 }}>
        Analyzed {new Date(profile.analyzed_at).toLocaleDateString()} · {profile.model || 'unknown model'}
      </div>
    </div>
  );
}
