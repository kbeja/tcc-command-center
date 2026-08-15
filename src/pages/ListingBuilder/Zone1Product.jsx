import { PRODUCT_FORMATS, BLANK_BRANDS } from '../../lib/productTruth';
import { TriState } from './shared';
import CollectionPicker from './CollectionPicker';

// Collapsed summary line — omits unconfirmed tri-states rather than
// asserting them. null (unconfirmed) is dropped entirely, never rendered
// as "No" — rendering an unchecked tri-state as a confirmed "No" would
// assert a fact nobody checked, exactly what TriState's own design
// prevents elsewhere.
function summaryLine(form) {
  return [
    [form.blankModel || form.blankBrand, form.productFormat].filter(Boolean).join(' '),
    form.collection,
    form.garmentColor,
    form.personalizationAvailable === true ? 'Personalization'
      : form.personalizationAvailable === false ? 'No personalization' : null,
  ].filter(Boolean).join(' · ');
}

// Zone 1 — Product (Milestone B). Product Name/Type, Product Truth (now a
// plain field group — its own inner collapse is gone now that Zone 1 itself
// collapses; a nested accordion inside another accordion is exactly what
// the design spec warns against), Collection, Sub-niche/Notes, Linked
// Concept, Design Image. Collapses once the three facts that actually gate
// generation/saving are confirmed (see index.jsx's autoCollapsedRef effect)
// — open/onToggle stay controlled by the parent so the global paste
// listener can force this open from outside.
export default function Zone1Product({
  open, onToggle,
  form, setField,
  collections, collectionObjects, chapters, extraCollections, onExtraCollectionsChange, onCollectionCreated,
  linkedConcept, pickableConcepts, onUnlinkConcept, onLinkConcept,
  imagePreview, analyzing, imageAnalysis, onImageAnalysisChange, imageAnalysisError,
  onUploadFile, onRetryAnalysis,
}) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <button type="button" onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: open ? 12 : 0 }}>
        <span className="eyebrow" style={{ margin: 0 }}>
          Product{!open && form.productName ? ` — ${form.productName}` : ''}
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>

      {!open && (
        <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)' }}>
          {summaryLine(form) || 'Not yet set'}
        </div>
      )}

      {open && (
        <>
          {/* Row 1: Product Name/Type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Product Name <span style={{ fontWeight: 400, opacity: 0.5 }}>(auto-fills from title)</span></label>
              <input value={form.productName} onChange={e => setField('productName', e.target.value)} placeholder="e.g. Animal Meme Crewneck" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Product Type <span style={{ fontWeight: 400, opacity: 0.5 }}>(free text, for your own reference)</span></label>
              <input value={form.productType} onChange={e => setField('productType', e.target.value)} placeholder="e.g. crewneck sweatshirt, tote bag, mug" />
            </div>
          </div>

          {/* Product Truth — Listing Intelligence Milestone A. The thing
              keyword data may never override. product_format is what the
              deterministic Compatibility Gate checks every keyword against
              before generation. Unset fields stay unset; nothing here is
              ever inferred. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label className="form-label">Format</label>
              <select value={form.productFormat} onChange={e => setField('productFormat', e.target.value)} style={{ fontSize: '0.78rem' }}>
                <option value="">— Unset —</option>
                {PRODUCT_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Blank / Brand</label>
              <select value={form.blankBrand} onChange={e => setField('blankBrand', e.target.value)} style={{ fontSize: '0.78rem' }}>
                <option value="">— Unset —</option>
                {BLANK_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Blank / Model</label>
              <input value={form.blankModel} onChange={e => setField('blankModel', e.target.value)} placeholder="e.g. Comfort Colors 1717" style={{ fontSize: '0.78rem' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Garment Color</label>
              <input value={form.garmentColor} onChange={e => setField('garmentColor', e.target.value)} placeholder="e.g. Pepper" style={{ fontSize: '0.78rem' }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Available Colors <span style={{ fontWeight: 400, opacity: 0.5 }}>(comma-separated)</span></label>
              <input
                value={(form.availableColors || []).join(', ')}
                onChange={e => setField('availableColors', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="e.g. Black, White, Pepper" style={{ fontSize: '0.78rem' }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Size Range</label>
              <input value={form.sizeRange} onChange={e => setField('sizeRange', e.target.value)} placeholder="e.g. S–3XL" style={{ fontSize: '0.78rem' }} />
            </div>
          </div>
          <div className="form-group" style={{ margin: '0 0 10px' }}>
            <label className="form-label">Material</label>
            <input value={form.material} onChange={e => setField('material', e.target.value)} placeholder="e.g. 100% ring-spun cotton" style={{ fontSize: '0.78rem' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <TriState label="Personalization available" value={form.personalizationAvailable} onChange={v => setField('personalizationAvailable', v)} />
            <TriState label="Customization available" value={form.customizationAvailable} onChange={v => setField('customizationAvailable', v)} />
            <TriState label="Gift wrap available" value={form.giftWrapAvailable} onChange={v => setField('giftWrapAvailable', v)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Production Time</label>
              <input value={form.productionTime} onChange={e => setField('productionTime', e.target.value)} placeholder="e.g. 2–3 business days" style={{ fontSize: '0.78rem' }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Shipping Policy</label>
              <input value={form.shippingPolicy} onChange={e => setField('shippingPolicy', e.target.value)} placeholder="e.g. USPS, 5–7 days domestic" style={{ fontSize: '0.78rem' }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Fulfillment Provider</label>
              <input value={form.fulfillmentProvider} onChange={e => setField('fulfillmentProvider', e.target.value)} placeholder="e.g. Printify" style={{ fontSize: '0.78rem' }} />
            </div>
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', opacity: 0.7, margin: '10px 0 16px', lineHeight: 1.5 }}>
            Unset fields are never guessed at generation time — a listing with no shipping policy set simply won't mention shipping, rather than inventing one.
          </div>

          {/* Collection */}
          <CollectionPicker
            collections={collections}
            collectionObjects={collectionObjects}
            chapters={chapters}
            value={form.collection}
            onChange={v => { setField('collection', v); onExtraCollectionsChange(new Set()); }}
            extraValues={extraCollections}
            onExtraChange={onExtraCollectionsChange}
            onCreated={onCollectionCreated}
          />

          {/* Sub-niche + Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Sub-niche <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
              <input value={form.niche} onChange={e => setField('niche', e.target.value)} placeholder="e.g. 90s Nostalgia, Animal Memes" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Notes <span style={{ fontWeight: 400, opacity: 0.5 }}>(optional)</span></label>
              <input value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Design direction, specific angle, etc." />
            </div>
          </div>

          {/* Linked Concept (Phase 10) */}
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">
              Linked Concept <span style={{ fontWeight: 400, opacity: 0.5 }}>— design direction, visual style, and mood get pulled into generation</span>
            </label>
            {linkedConcept ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '0.72rem', padding: '4px 10px', borderRadius: 20,
                  background: 'rgba(124,175,138,0.12)', color: '#2d6b3c',
                  border: '1px solid rgba(124,175,138,0.3)',
                }}>
                  🔗 {linkedConcept.name}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onUnlinkConcept}>
                  Unlink
                </button>
              </div>
            ) : pickableConcepts.length > 0 ? (
              <select
                value=""
                onChange={e => { if (e.target.value) onLinkConcept(e.target.value); }}
                style={{ marginTop: 4, fontSize: '0.78rem' }}
              >
                <option value="">— None —</option>
                {pickableConcepts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', marginTop: 4 }}>
                {form.collection ? 'No concepts found for this collection.' : 'Select a collection to see linkable concepts.'}
              </div>
            )}
          </div>

          {/* Design Image */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Design Image</div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt="Design mockup"
                  style={{ width: 120, height: 120, objectFit: 'contain', borderRadius: 4, border: '1px solid rgba(43,41,38,0.12)', background: '#f5f3f0', flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                    {imagePreview ? 'Replace image' : 'Upload mockup'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) onUploadFile(e.target.files[0]); }} />
                  </label>
                  {!imagePreview && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', alignSelf: 'center' }}>
                      or Ctrl+V to paste a Snip Tool screenshot
                    </span>
                  )}
                </div>
                {analyzing && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--charcoal-soft)' }}>Analyzing design…</div>
                )}
                {imageAnalysisError && !analyzing && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem', color: 'var(--alert)' }}>
                    <span>⚠ {imageAnalysisError}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={onRetryAnalysis}>
                      Retry
                    </button>
                  </div>
                )}
                {imageAnalysis && !analyzing && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--charcoal-soft)', marginBottom: 4, opacity: 0.6 }}>
                      AI analysis — edit if anything is wrong
                    </div>
                    <textarea
                      value={imageAnalysis}
                      onChange={e => onImageAnalysisChange(e.target.value)}
                      rows={4}
                      style={{ width: '100%', fontSize: '0.78rem', lineHeight: 1.6, borderLeft: '3px solid var(--dusty-rose)', borderRadius: '0 4px 4px 0', padding: '8px 12px', resize: 'vertical', boxSizing: 'border-box', background: 'var(--warm-white)', border: '1px solid rgba(43,41,38,0.12)' }}
                    />
                  </div>
                )}
                {!imagePreview && !analyzing && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--charcoal-soft)', opacity: 0.6 }}>
                    Upload your Printify mockup — Claude will analyze the style and colors for better copy.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
