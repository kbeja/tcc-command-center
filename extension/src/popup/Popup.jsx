import { useState, useEffect } from 'react';
import { isConfigured } from '../lib/supabase.js';
import { fetchCollections, saveSpark, saveWorkshopNote, saveKeyword } from '../lib/data.js';

const DESTINATIONS = [
  { key: 'spark', label: 'Spark' },
  { key: 'keyword', label: 'Keyword' },
  { key: 'note', label: 'Note' },
];

// Rough heuristic for a smart default, not a hard rule — the buttons above the
// content box let the user override it in one click either way. Short,
// phrase-like selections read as keywords; longer selections or no selection
// at all (just browsing, nothing highlighted) read as a note about the page.
function guessDestination(selection) {
  if (!selection) return 'note';
  const wordCount = selection.trim().split(/\s+/).length;
  return wordCount <= 6 ? 'keyword' : 'spark';
}

export default function Popup() {
  const [configured, setConfigured] = useState(null); // null = still checking
  const [tab, setTab] = useState(null);
  const [selection, setSelection] = useState('');
  const [collections, setCollections] = useState([]);
  const [destination, setDestination] = useState('note');
  const [content, setContent] = useState('');
  const [collectionChoice, setCollectionChoice] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  useEffect(() => {
    (async () => {
      const ok = await isConfigured();
      setConfigured(ok);
      if (!ok) return;

      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      setTab(activeTab || null);

      let selectedText = '';
      if (activeTab?.id) {
        try {
          const response = await chrome.tabs.sendMessage(activeTab.id, { type: 'GET_SELECTION' });
          selectedText = response?.selection || '';
        } catch {
          // No content script on this page (chrome://, the Web Store, etc.) — fine, just no selection.
        }
      }
      setSelection(selectedText);
      setDestination(guessDestination(selectedText));
      setContent(selectedText || activeTab?.title || '');

      const { data } = await fetchCollections();
      setCollections(data);
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveResult(null);
    try {
      let result;
      if (destination === 'spark') {
        result = await saveSpark({ content, collectionTag: collectionChoice || null });
      } else if (destination === 'keyword') {
        if (!collectionChoice) throw new Error('Pick a collection for this keyword.');
        result = await saveKeyword({ keyword: content, collection: collectionChoice });
      } else {
        const sourceLine = tab?.url ? `\n\nCaptured from: ${tab.url}` : '';
        result = await saveWorkshopNote({ content: content + sourceLine, source: tab?.url || 'Quick Capture' });
      }
      if (result.error) throw result.error;
      setSaveResult({ ok: true, message: 'Saved ✓' });
      setTimeout(() => window.close(), 900);
    } catch (err) {
      setSaveResult({ ok: false, message: err.message });
    } finally {
      setSaving(false);
    }
  }

  if (configured === null) {
    return <div style={{ padding: 20, fontSize: '0.8rem', color: 'var(--charcoal-soft)' }}>Loading…</div>;
  }

  if (!configured) {
    return (
      <div style={{ padding: 20 }}>
        <h2 style={{ marginBottom: 8, fontSize: '1.1rem' }}>TCC Quick Capture</h2>
        <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 14, lineHeight: 1.6 }}>
          Connect this extension to your TCC Command Center database before capturing anything.
        </div>
        <button className="btn btn-primary" onClick={() => chrome.runtime.openOptionsPage()}>
          Set up connection →
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: '1rem' }}>Quick Capture</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => chrome.runtime.openOptionsPage()} title="Settings">⚙</button>
      </div>

      {tab?.title && (
        <div style={{ fontSize: '0.68rem', color: 'var(--charcoal-soft)', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selection ? 'Selected text from ' : 'From '}{tab.title}
        </div>
      )}

      <div className="form-group">
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {DESTINATIONS.map(d => (
            <button
              key={d.key}
              onClick={() => setDestination(d.key)}
              style={{
                flex: 1, padding: '6px 0', fontSize: '0.75rem', fontWeight: destination === d.key ? 600 : 400,
                borderRadius: 2, cursor: 'pointer',
                background: destination === d.key ? 'var(--warm-charcoal)' : 'var(--charcoal-faint)',
                color: destination === d.key ? 'var(--warm-white)' : 'var(--warm-charcoal)',
                border: 'none',
              }}
            >
              {d.label}
            </button>
          ))}
        </div>

        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={destination === 'keyword' ? 1 : 4}
          placeholder={destination === 'keyword' ? 'The keyword or phrase…' : 'What did you find?'}
        />
      </div>

      {(destination === 'spark' || destination === 'keyword') && (
        <div className="form-group">
          <label className="form-label">
            Collection{destination === 'keyword' ? '' : ' (optional)'}
          </label>
          <select value={collectionChoice} onChange={e => setCollectionChoice(e.target.value)}>
            <option value="">— {destination === 'keyword' ? 'Select' : 'None'} —</option>
            {[...new Set(collections.map(c => c.chapter).filter(Boolean))].sort().map(ch => (
              <optgroup key={ch} label={ch}>
                {collections.filter(c => c.chapter === ch).map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </optgroup>
            ))}
            {collections.filter(c => !c.chapter).map(c => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {saveResult && (
        <div style={{
          fontSize: '0.75rem', marginBottom: 10, padding: '6px 10px', borderRadius: 2,
          background: saveResult.ok ? 'rgba(124,175,138,0.1)' : 'rgba(201,123,123,0.08)',
          border: `1px solid ${saveResult.ok ? 'var(--success)' : 'var(--alert)'}`,
          color: saveResult.ok ? '#2d6b3c' : 'var(--alert)',
        }}>
          {saveResult.message}
        </div>
      )}

      <button
        className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center' }}
        onClick={handleSave}
        disabled={saving || !content.trim() || (destination === 'keyword' && !collectionChoice)}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
