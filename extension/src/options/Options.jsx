import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getConfig, setConfig } from '../lib/supabase.js';

export default function Options() {
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [status, setStatus] = useState(null); // { ok: bool, message: string }
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getConfig().then(({ supabaseUrl, supabaseKey }) => {
      setSupabaseUrl(supabaseUrl);
      setSupabaseKey(supabaseKey);
    });
  }, []);

  async function handleTest() {
    setTesting(true);
    setStatus(null);
    try {
      const client = createClient(supabaseUrl.trim(), supabaseKey.trim());
      const { error } = await client.from('collections').select('name').limit(1);
      if (error) throw error;
      setStatus({ ok: true, message: 'Connected — found your collections table.' });
    } catch (err) {
      setStatus({ ok: false, message: 'Connection failed: ' + err.message });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    await setConfig(supabaseUrl.trim(), supabaseKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ padding: '24px 22px' }}>
      <h2 style={{ marginBottom: 6 }}>TCC Quick Capture</h2>
      <div style={{ fontSize: '0.78rem', color: 'var(--charcoal-soft)', marginBottom: 20, lineHeight: 1.6 }}>
        One-time setup. These are the same Supabase project URL and anon key your
        TCC Command Center app already uses — find them in Supabase → Project
        Settings → API. Stored locally in your browser only.
      </div>

      <div className="form-group">
        <label className="form-label">Supabase URL</label>
        <input
          value={supabaseUrl}
          onChange={e => setSupabaseUrl(e.target.value)}
          placeholder="https://xxxxxxxx.supabase.co"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Supabase Anon Key</label>
        <input
          type="password"
          value={supabaseKey}
          onChange={e => setSupabaseKey(e.target.value)}
          placeholder="eyJhbGci..."
        />
      </div>

      {status && (
        <div style={{
          fontSize: '0.78rem', marginBottom: 12, padding: '8px 12px', borderRadius: 2,
          background: status.ok ? 'rgba(124,175,138,0.1)' : 'rgba(201,123,123,0.08)',
          border: `1px solid ${status.ok ? 'var(--success)' : 'var(--alert)'}`,
          color: status.ok ? '#2d6b3c' : 'var(--alert)',
        }}>
          {status.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-ghost" onClick={handleTest} disabled={testing || !supabaseUrl.trim() || !supabaseKey.trim()}>
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={!supabaseUrl.trim() || !supabaseKey.trim()}>
          Save
        </button>
        {saved && <span style={{ fontSize: '0.78rem', color: '#2d6b3c' }}>✓ Saved</span>}
      </div>
    </div>
  );
}
