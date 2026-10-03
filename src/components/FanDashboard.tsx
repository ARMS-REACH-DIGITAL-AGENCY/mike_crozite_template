'use client';

import { useState, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// FanDashboard — "HELP IMPROVE YAT?STATS" sections for the account drawer.
// Only one section open at a time. Player selection via platform search.
// ---------------------------------------------------------------------------

// -- Styles ---------------------------------------------------------------

const sectionStyle: React.CSSProperties = {
  borderTop: '1px solid var(--line)',
  paddingTop: '20px',
  marginTop: '20px',
  paddingLeft: '4px',
  paddingRight: '4px',
};

const headerStyle: React.CSSProperties = {
  fontSize: '15px',
  marginBottom: '14px',
  fontFamily: '"Bebas Neue", Oswald, sans-serif',
  letterSpacing: '.08em',
  color: 'var(--gold)',
  textTransform: 'uppercase',
};

const subHeaderStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  background: 'rgba(255,255,255,.03)',
  border: '1px solid var(--line)',
  borderRadius: '8px',
  padding: '12px 14px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  letterSpacing: '.02em',
  color: 'var(--fg)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '8px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: '4px',
  marginTop: '10px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid var(--line)',
  background: 'rgba(255, 255, 255, .04)',
  color: 'var(--ink)',
  fontSize: '14px',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  outline: 'none',
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  background: 'var(--gold)',
  color: '#000',
  border: 'none',
  borderRadius: '6px',
  fontFamily: '"Bebas Neue", Oswald, sans-serif',
  fontSize: '14px',
  letterSpacing: '.08em',
  cursor: 'pointer',
  marginTop: '14px',
  marginBottom: '8px',
  fontWeight: 500,
};

const feedbackStyle = (ok: boolean): React.CSSProperties => ({
  fontSize: '13px',
  fontFamily: 'Inter, -apple-system, sans-serif',
  color: ok ? '#4ade80' : '#f87171',
  marginBottom: '8px',
  padding: '8px 12px',
  background: ok ? 'rgba(74,222,128,.1)' : 'rgba(248,113,113,.1)',
  borderRadius: '6px',
});

const formContainerStyle: React.CSSProperties = {
  padding: '4px 2px 12px 2px',
};

const disclaimerStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--muted)',
  fontFamily: 'Inter, -apple-system, sans-serif',
  marginTop: '8px',
  lineHeight: 1.4,
};

// -- Helpers ---------------------------------------------------------------

async function postJson(url: string, data: Record<string, unknown>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Something went wrong');
  return json;
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: 'var(--gold)' }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// -- Player Picker ----------------------------------------------------------

type PlayerResult = {
  playerId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  schoolId: string;
  schoolName: string;
  city: string;
  state: string;
};

function PlayerPicker({
  selected,
  onSelect,
  label = 'Find Player',
  required = false,
}: {
  selected: PlayerResult | null;
  onSelect: (p: PlayerResult | null) => void;
  label?: string;
  required?: boolean;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/players/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
        const json = await res.json();
        // API returns { results: [...] } or { players: [...] } — handle both
        const list = json.results || json.players || [];
        setResults(list.slice(0, 8));
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  if (selected) {
    return (
      <div>
        <label style={labelStyle}>
          {label} {required && <span style={{ color: 'var(--gold)' }}>*</span>}
        </label>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px',
          borderRadius: '6px',
          border: '1px solid var(--gold)',
          background: 'rgba(255,215,0,.08)',
        }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--fg)' }}>
              {selected.displayName || `${selected.firstName} ${selected.lastName}`}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
              {selected.schoolName} {selected.city && selected.state ? `(${selected.city}, ${selected.state})` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { onSelect(null); setQ(''); }}
            style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '16px' }}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: 'var(--gold)' }}>*</span>}
      </label>
      <input
        type="text"
        placeholder="Type player name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onBlur={() => setTimeout(() => setShowResults(false), 200)}
        onFocus={() => { if (results.length) setShowResults(true); }}
        style={inputStyle}
      />
      {showResults && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 50,
          background: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: '6px',
          marginTop: '4px',
          maxHeight: '240px',
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,.4)',
        }}>
          {results.map((p) => (
            <button
              key={`${p.playerId}-${p.schoolId}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(p); setShowResults(false); setQ(''); }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--line)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--fg)' }}>
                {p.displayName || `${p.firstName} ${p.lastName}`}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {p.schoolName} {p.city && p.state ? `(${p.city}, ${p.state})` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
      {searching && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>Searching…</div>}
    </div>
  );
}

// -- School Picker ----------------------------------------------------------

type SchoolResult = {
  hsid: string;
  hsname: string;
  hslocation: string;
};

function SchoolPicker({
  selected,
  onSelect,
  label = 'High School',
  required = false,
}: {
  selected: SchoolResult | null;
  onSelect: (s: SchoolResult | null) => void;
  label?: string;
  required?: boolean;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SchoolResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/schools/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
        const json = await res.json();
        const list = json.schools || json.results || [];
        setResults(list.slice(0, 8));
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  if (selected) {
    return (
      <div>
        <label style={labelStyle}>
          {label} {required && <span style={{ color: 'var(--gold)' }}>*</span>}
        </label>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px',
          borderRadius: '6px',
          border: '1px solid var(--gold)',
          background: 'rgba(255,215,0,.08)',
        }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--fg)' }}>
              {selected.hsname}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
              {selected.hslocation || `HSID: ${selected.hsid}`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { onSelect(null); setQ(''); }}
            style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '16px' }}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: 'var(--gold)' }}>*</span>}
      </label>
      <input
        type="text"
        placeholder="Type school name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onBlur={() => setTimeout(() => setShowResults(false), 200)}
        onFocus={() => { if (results.length) setShowResults(true); }}
        style={inputStyle}
      />
      {showResults && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 50,
          background: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: '6px',
          marginTop: '4px',
          maxHeight: '240px',
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,.4)',
        }}>
          {results.map((s) => (
            <button
              key={s.hsid}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(s); setShowResults(false); setQ(''); }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--line)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--fg)' }}>
                {s.hsname}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {s.hslocation || `HSID: ${s.hsid}`}
              </div>
            </button>
          ))}
        </div>
      )}
      {searching && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>Searching…</div>}
    </div>
  );
}

// -- Team Picker ------------------------------------------------------------

type TeamResult = {
  currentTeamName: string;
};

function TeamPicker({
  selected,
  onSelect,
  label = 'Team',
  required = false,
}: {
  selected: string | null;
  onSelect: (t: string | null) => void;
  label?: string;
  required?: boolean;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<TeamResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/teams/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
        const json = await res.json();
        const list = json.teams || json.results || [];
        setResults(list.slice(0, 8));
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  if (selected) {
    return (
      <div>
        <label style={labelStyle}>
          {label} {required && <span style={{ color: 'var(--gold)' }}>*</span>}
        </label>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px',
          borderRadius: '6px',
          border: '1px solid var(--gold)',
          background: 'rgba(255,215,0,.08)',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--fg)' }}>
            {selected}
          </div>
          <button
            type="button"
            onClick={() => { onSelect(null); setQ(''); }}
            style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '16px' }}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: 'var(--gold)' }}>*</span>}
      </label>
      <input
        type="text"
        placeholder="Type team name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onBlur={() => setTimeout(() => setShowResults(false), 200)}
        onFocus={() => { if (results.length) setShowResults(true); }}
        style={inputStyle}
      />
      {showResults && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 50,
          background: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: '6px',
          marginTop: '4px',
          maxHeight: '240px',
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,.4)',
        }}>
          {results.map((t, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSelect(t.currentTeamName); setShowResults(false); setQ(''); }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--line)',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--fg)',
              }}
            >
              {t.currentTeamName}
            </button>
          ))}
        </div>
      )}
      {searching && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>Searching…</div>}
    </div>
  );
}

// -- Manual player fields (when not on platform) ----------------------------

function ManualPlayerFields({
  prefix,
  values,
  onChange,
}: {
  prefix: string;
  values: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <>
      <Field label="Player Name" required>
        <input
          type="text" placeholder="Full name"
          value={values[`${prefix}_name`] || ''}
          onChange={(e) => onChange(`${prefix}_name`, e.target.value)}
          required style={inputStyle}
        />
      </Field>
      <Field label="High School" required>
        <input
          type="text" placeholder="e.g. Hamilton High School"
          value={values[`${prefix}_hs`] || ''}
          onChange={(e) => onChange(`${prefix}_hs`, e.target.value)}
          required style={inputStyle}
        />
      </Field>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <Field label="Level">
            <select
              value={values[`${prefix}_level`] || ''}
              onChange={(e) => onChange(`${prefix}_level`, e.target.value)}
              style={inputStyle}
            >
              <option value="">Select…</option>
              <option value="MLB">MLB</option>
              <option value="MiLB">MiLB</option>
              <option value="Indy">Indy Ball</option>
              <option value="NCAA D1">NCAA D1</option>
              <option value="NCAA D2">NCAA D2</option>
              <option value="NCAA D3">NCAA D3</option>
              <option value="NAIA">NAIA</option>
              <option value="JUCO">JUCO</option>
              <option value="HS">High School</option>
              <option value="Other">Other</option>
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Position">
            <input
              type="text" placeholder="e.g. SS, RHP"
              value={values[`${prefix}_pos`] || ''}
              onChange={(e) => onChange(`${prefix}_pos`, e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>
      </div>
      <Field label="Current Team">
        <input
          type="text" placeholder="e.g. Arizona Diamondbacks"
          value={values[`${prefix}_team`] || ''}
          onChange={(e) => onChange(`${prefix}_team`, e.target.value)}
          style={inputStyle}
        />
      </Field>
    </>
  );
}

// -- News Tip Form -----------------------------------------------------------

function NewsTipForm({ senderName }: { senderName: string }) {
  const [player, setPlayer] = useState<PlayerResult | null>(null);
  const [notOnPlatform, setNotOnPlatform] = useState(false);
  const [manual, setManual] = useState<Record<string, string>>({});
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const setManualField = (k: string, v: string) => setManual((m) => ({ ...m, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const payload: Record<string, unknown> = {
        article_url: url, notes, sender_name: senderName,
      };
      if (player) {
        payload.playerid = player.playerId;
        payload.raw_player_name = `${player.firstName} ${player.lastName}`;
        payload.matched_hsid = player.schoolId;
      } else if (notOnPlatform) {
        payload.raw_player_name = manual['tip_name'];
        payload.notes = [
          `School: ${manual['tip_hs'] || '?'}`,
          `Level: ${manual['tip_level'] || '?'}`,
          `Position: ${manual['tip_pos'] || '?'}`,
          `Team: ${manual['tip_team'] || '?'}`,
          notes ? `Notes: ${notes}` : '',
        ].filter(Boolean).join(' | ');
      }
      const r = await postJson('/api/tips/news', payload);
      setOk(true); setMsg(r.message);
      setPlayer(null); setNotOnPlatform(false); setManual({}); setUrl(''); setNotes('');
    } catch (err: any) {
      setOk(false); setMsg(err.message);
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit}>
      {msg && <p style={feedbackStyle(ok)}>{msg}</p>}
      {!notOnPlatform ? (
        <>
          <PlayerPicker selected={player} onSelect={setPlayer} label="Which player is this about?" />
          <button
            type="button"
            onClick={() => { setNotOnPlatform(true); setPlayer(null); }}
            style={{ background: 'transparent', border: 'none', color: 'var(--gold)', fontSize: '12px', cursor: 'pointer', marginTop: '6px', padding: 0 }}
          >
            Player not on YAT?STATS? Enter manually →
          </button>
        </>
      ) : (
        <>
          <ManualPlayerFields prefix="tip" values={manual} onChange={setManualField} />
          <button
            type="button"
            onClick={() => { setNotOnPlatform(false); setManual({}); }}
            style={{ background: 'transparent', border: 'none', color: 'var(--gold)', fontSize: '12px', cursor: 'pointer', marginTop: '6px', padding: 0 }}
          >
            ← Back to player search
          </button>
        </>
      )}
      <Field label="Article URL" required>
        <input type="url" placeholder="https://…" value={url}
          onChange={(e) => setUrl(e.target.value)} required style={inputStyle} />
      </Field>
      <Field label="Why is this newsworthy?">
        <textarea placeholder="What happened?" value={notes}
          onChange={(e) => setNotes(e.target.value)} rows={2}
          style={{ ...inputStyle, resize: 'vertical' }} />
      </Field>
      <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Submitting…' : 'Submit Tip'}
      </button>
    </form>
  );
}

// -- Missing Player Form ------------------------------------------------------

function MissingPlayerForm({ defaultHsid }: { defaultHsid: string }) {
  const [manual, setManual] = useState<Record<string, string>>({});
  const [school, setSchool] = useState<SchoolResult | null>(null);
  const [gradYear, setGradYear] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const setManualField = (k: string, v: string) => setManual((m) => ({ ...m, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const r = await postJson('/api/tips/missing-player', {
        player_name: manual['mp_name'],
        school_name: school ? school.hsname : (manual['mp_hs'] || null),
        hsid: school ? school.hsid : (defaultHsid || null),
        grad_year: gradYear ? parseInt(gradYear, 10) : null,
        position: manual['mp_pos'] || null,
        level: manual['mp_level'] || null,
        current_team: manual['mp_team'] || null,
        notes: notes || null,
      });
      setOk(true); setMsg(r.message);
      setManual({}); setSchool(null); setGradYear(''); setNotes('');
    } catch (err: any) {
      setOk(false); setMsg(err.message);
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit}>
      {msg && <p style={feedbackStyle(ok)}>{msg}</p>}
      <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>
        Know a player who should be on YAT?STATS but isn't? Tell us who.
      </p>
      <Field label="Player Name" required>
        <input
          type="text" placeholder="Full name"
          value={manual['mp_name'] || ''}
          onChange={(e) => setManualField('mp_name', e.target.value)}
          required style={inputStyle}
        />
      </Field>
      <SchoolPicker selected={school} onSelect={setSchool} label="High School" required />
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <Field label="Level">
            <select
              value={manual['mp_level'] || ''}
              onChange={(e) => setManualField('mp_level', e.target.value)}
              style={inputStyle}
            >
              <option value="">Select…</option>
              <option value="MLB">MLB</option>
              <option value="MiLB">MiLB</option>
              <option value="Indy">Indy Ball</option>
              <option value="NCAA D1">NCAA D1</option>
              <option value="NCAA D2">NCAA D2</option>
              <option value="NCAA D3">NCAA D3</option>
              <option value="NAIA">NAIA</option>
              <option value="JUCO">JUCO</option>
              <option value="HS">High School</option>
              <option value="Other">Other</option>
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Position">
            <input
              type="text" placeholder="e.g. SS, RHP"
              value={manual['mp_pos'] || ''}
              onChange={(e) => setManualField('mp_pos', e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>
      </div>
      <Field label="Current Team">
        <input
          type="text" placeholder="e.g. Arizona Diamondbacks"
          value={manual['mp_team'] || ''}
          onChange={(e) => setManualField('mp_team', e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="Grad Year">
        <input type="number" placeholder="e.g. 2020" value={gradYear}
          onChange={(e) => setGradYear(e.target.value)} min={1950} max={2040} style={inputStyle} />
      </Field>
      <Field label="Additional Notes">
        <textarea placeholder="Anything else we should know?" value={notes}
          onChange={(e) => setNotes(e.target.value)} rows={2}
          style={{ ...inputStyle, resize: 'vertical' }} />
      </Field>
      <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Submitting…' : 'Suggest Player'}
      </button>
    </form>
  );
}

// -- Correction Form ----------------------------------------------------------

function CorrectionForm({ senderName }: { senderName: string }) {
  const [player, setPlayer] = useState<PlayerResult | null>(null);
  const [correctionType, setCorrectionType] = useState('player_info');
  const [correction, setCorrection] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const r = await postJson('/api/tips/correction', {
        correction_type: correctionType,
        playerid: player?.playerId || null,
        raw_player_name: player ? `${player.firstName} ${player.lastName}` : null,
        matched_hsid: player?.schoolId || null,
        correction,
        page_url: typeof window !== 'undefined' ? window.location.href : '',
        sender_name: senderName,
      });
      setOk(true); setMsg(r.message);
      setCorrection(''); setPlayer(null);
    } catch (err: any) {
      setOk(false); setMsg(err.message);
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit}>
      {msg && <p style={feedbackStyle(ok)}>{msg}</p>}
      <PlayerPicker selected={player} onSelect={setPlayer} label="Which player?" />
      <Field label="What's wrong?">
        <select value={correctionType} onChange={(e) => setCorrectionType(e.target.value)} style={inputStyle}>
          <option value="player_info">Player info (team, stats, bio)</option>
          <option value="photo">Wrong or bad photo</option>
          <option value="missing_player">Player missing from site</option>
          <option value="school_info">School info</option>
          <option value="other">Something else</option>
        </select>
      </Field>
      <Field label="Describe the issue" required>
        <textarea placeholder="What's incorrect and what should it be?" value={correction}
          onChange={(e) => setCorrection(e.target.value)} required rows={3}
          style={{ ...inputStyle, resize: 'vertical' }} />
      </Field>
      <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Submitting…' : 'Report Correction'}
      </button>
    </form>
  );
}

// -- Photo Upload Form --------------------------------------------------------

const UPLOAD_TYPES = [
  { value: 'flip_card', label: 'High School Image (Front Of Flip Card)', needsPlayer: true, needsDate: true },
  { value: 'headshot', label: 'Headshot', needsPlayer: true, needsDate: true },
  { value: 'back_hero', label: 'Flip Card Back (Current Team Hero)', needsPlayer: true, needsDate: false },
  { value: 'timeline_hero', label: 'Career Timeline Annual Hero', needsPlayer: true, needsDate: true },
  { value: 'school_logo', label: 'High School Logo', needsPlayer: false, needsDate: false },
  { value: 'team_logo', label: 'Next-Level Team Logo (College/Pro)', needsPlayer: false, needsDate: false },
];

type UploadRow = {
  file: File | null;
  date: string;
  type: string;
  player: PlayerResult | null;
  manualName: string;
  manualSchool: SchoolResult | null;
  playerNotFound: boolean;
  cropX: number;
  cropY: number;
  previewUrl: string | null;
};

const blankUploadRow = (): UploadRow => ({
  file: null, date: '', type: 'flip_card', player: null,
  manualName: '', manualSchool: null, playerNotFound: false,
  cropX: 50, cropY: 50, previewUrl: null,
});

// Crop preview: draggable image inside a 5:7 frame so the uploader
// can position the subject before submitting.
function CropPreview({ file, cropX, cropY, onCropChange }: {
  file: File;
  cropX: number;
  cropY: number;
  onCropChange: (x: number, y: number) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, cx: 50, cy: 50 });
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleStart = (clientX: number, clientY: number) => {
    setDragging(true);
    setDragStart({ x: clientX, y: clientY, cx: cropX, cy: cropY });
  };
  const handleMove = (clientX: number, clientY: number) => {
    if (!dragging || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const dx = ((clientX - dragStart.x) / rect.width) * 100;
    const dy = ((clientY - dragStart.y) / rect.height) * 100;
    // Invert: dragging the image moves it opposite to position the subject
    const nx = Math.min(100, Math.max(0, dragStart.cx - dx));
    const ny = Math.min(100, Math.max(0, dragStart.cy - dy));
    onCropChange(Math.round(nx), Math.round(ny));
  };

  if (!previewUrl) return null;

  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
        Drag to position — this is how it will appear (5×7 portrait):
      </div>
      <div
        ref={frameRef}
        onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
        onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
        onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={() => setDragging(false)}
        style={{
          width: '150px',
          aspectRatio: '5 / 7',
          overflow: 'hidden',
          borderRadius: '6px',
          border: '2px solid var(--gold)',
          cursor: dragging ? 'grabbing' : 'grab',
          position: 'relative',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <img
          src={previewUrl}
          alt="Crop preview"
          draggable={false}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: `${cropX}% ${cropY}%`,
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}

export function PhotoUploadForm({ defaultHsid, userName, userEmail }: {
  defaultHsid: string;
  userName?: string;
  userEmail?: string;
}) {
  const [teamAtTime, setTeamAtTime] = useState<string | null>(null);
  const [rows, setRows] = useState<UploadRow[]>([blankUploadRow()]);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const updateRow = (i: number, patch: Partial<UploadRow>) => {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  };
  const addRow = () => {
    if (rows.length < 10) setRows((r) => [...r, blankUploadRow()]);
  };
  const removeRow = (i: number) => {
    setRows((r) => r.filter((_, j) => j !== i));
  };

  const rowValid = (row: UploadRow) => {
    if (!row.file) return false;
    const t = UPLOAD_TYPES.find((x) => x.value === row.type);
    if (!t) return false;
    if (t.needsDate && !row.date) return false;
    if (t.needsPlayer) {
      if (row.playerNotFound) {
        if (!row.manualName.trim() || !row.manualSchool) return false;
      } else if (!row.player) return false;
    }
    if (row.type === 'school_logo' && !row.manualSchool) return false;
    return true;
  };
  const allValid = rows.length > 0 && rows.every(rowValid);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    let succeeded = 0;
    let failed = 0;
    try {
      for (const row of rows) {
        if (!row.file) continue;
        const t = UPLOAD_TYPES.find((x) => x.value === row.type);
        if (!t) continue;
        try {
          const fd = new FormData();
          fd.append('file', row.file);
          fd.append('category', t.needsPlayer ? 'player' : 'school');
          if (t.needsPlayer) {
            if (row.playerNotFound) {
              fd.append('player_name', row.manualName.trim());
              fd.append('manual_entry', 'true');
              if (row.manualSchool) {
                fd.append('hsid', row.manualSchool.hsid);
                fd.append('school_name', row.manualSchool.hsname);
              }
            } else if (row.player) {
              fd.append('playerid', row.player.playerId);
              fd.append('player_name', `${row.player.firstName} ${row.player.lastName}`);
              if (row.player.schoolId) fd.append('hsid', row.player.schoolId);
              if (row.player.schoolName) fd.append('school_name', row.player.schoolName);
            }
          }
          if (row.type === 'school_logo' && row.manualSchool) {
            fd.append('hsid', row.manualSchool.hsid);
            fd.append('school_name', row.manualSchool.hsname);
          }
          fd.append('purpose', row.type);
          fd.append('team_at_time', teamAtTime || '');
          if (row.date) fd.append('date_taken', row.date);
          fd.append('crop_x', String(row.cropX));
          fd.append('crop_y', String(row.cropY));
          const res = await fetch('/api/upload/image', { method: 'POST', credentials: 'include', body: fd });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Upload failed');
          succeeded++;
        } catch { failed++; }
      }
      if (failed === 0) {
        setOk(true); setMsg(`Thank you — upload complete! ${succeeded} photo${succeeded > 1 ? 's' : ''} received.`);
      } else {
        setOk(false); setMsg(`${succeeded} uploaded, ${failed} failed. Try the failed ones again.`);
      }
      setRows([blankUploadRow()]);
      setTeamAtTime(null);
    } catch (err: any) {
      setOk(false); setMsg(err.message);
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit}>
      {msg && <p style={feedbackStyle(ok)}>{msg}</p>}

      {userName && (
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
          Thank you, {userName} — we appreciate your participation!
        </div>
      )}

      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.06em',
        textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 8px' }}>
        Photos to upload ({rows.length}/10)
      </div>

      {rows.map((row, i) => {
        const t = UPLOAD_TYPES.find((x) => x.value === row.type);
        return (
          <div key={i} style={{
            border: '1px solid var(--line)', borderRadius: '8px',
            padding: '12px', marginBottom: '8px',
            background: 'rgba(255,255,255,.02)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)' }}>
                Photo {i + 1}
              </span>
              {rows.length > 1 && (
                <button type="button" onClick={() => removeRow(i)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--muted)',
                    cursor: 'pointer', fontSize: '16px' }}>×</button>
              )}
            </div>

            <label style={{ ...labelStyle, marginBottom: '4px' }}>Choose photo</label>
            <input
              type="file" accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => updateRow(i, { file: e.target.files?.[0] || null, cropX: 50, cropY: 50 })}
              style={{ ...inputStyle, padding: '8px 10px', marginBottom: '8px' }}
            />

            {row.file && ['flip_card', 'headshot'].includes(row.type) && (
              <CropPreview
                file={row.file}
                cropX={row.cropX}
                cropY={row.cropY}
                onCropChange={(x, y) => updateRow(i, { cropX: x, cropY: y })}
              />
            )}

            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ ...labelStyle, marginBottom: '4px' }}>Where does this go?</label>
                <select value={row.type} onChange={(e) => updateRow(i, { type: e.target.value })}
                  style={{ ...inputStyle, marginBottom: 0 }}>
                  {UPLOAD_TYPES.map((ut) => (
                    <option key={ut.value} value={ut.value}>{ut.label}</option>
                  ))}
                </select>
              </div>
              {t?.needsDate && (
                <div style={{ width: '150px' }}>
                  <label style={{ ...labelStyle, marginBottom: '4px' }}>Date taken</label>
                  <input type="date" value={row.date}
                    onChange={(e) => updateRow(i, { date: e.target.value })}
                    required
                    style={{ ...inputStyle, marginBottom: 0 }} />
                </div>
              )}
            </div>

            {t?.needsPlayer && !row.playerNotFound && (
              <PlayerPicker
                selected={row.player}
                onSelect={(p) => updateRow(i, { player: p })}
                label="Which player is this?"
                required
              />
            )}

            {t?.needsPlayer && row.player && (
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>
                Not the right player?{' '}
                <button type="button"
                  onClick={() => updateRow(i, { playerNotFound: true, player: null })}
                  style={{ background: 'none', border: 'none', color: 'var(--gold)',
                    cursor: 'pointer', textDecoration: 'underline', fontSize: '11px', padding: 0 }}>
                  Player not found
                </button>
              </div>
            )}

            {t?.needsPlayer && row.playerNotFound && (
              <div style={{ marginBottom: '8px' }}>
                <Field label="Player name (not in our system)" required>
                  <input type="text" placeholder="e.g. John Smith"
                    value={row.manualName}
                    onChange={(e) => updateRow(i, { manualName: e.target.value })}
                    required style={inputStyle} />
                </Field>
                <SchoolPicker
                  selected={row.manualSchool}
                  onSelect={(s) => updateRow(i, { manualSchool: s })}
                  label="Which high school?"
                  required
                />
                <button type="button"
                  onClick={() => updateRow(i, { playerNotFound: false, manualName: '', manualSchool: null })}
                  style={{ background: 'none', border: 'none', color: 'var(--gold)',
                    cursor: 'pointer', textDecoration: 'underline', fontSize: '11px', padding: 0 }}>
                  Back to player search
                </button>
              </div>
            )}

            {row.type === 'school_logo' && (
              <SchoolPicker
                selected={row.manualSchool}
                onSelect={(s) => updateRow(i, { manualSchool: s })}
                label="Which high school is this logo for?"
                required
              />
            )}

            {row.type === 'flip_card' && (
              <div style={{ fontSize: '11px', color: 'var(--gold)', marginTop: '6px' }}>
                Must be a high school photo. Baby photos or current pro photos will be rejected.
              </div>
            )}
          </div>
        );
      })}

      {rows.length < 10 && (
        <button type="button" onClick={addRow}
          style={{ ...buttonStyle, background: 'transparent', border: '1px dashed var(--line)',
            color: 'var(--muted)', marginBottom: '12px' }}>
          + Add another photo
        </button>
      )}

      <TeamPicker
        selected={teamAtTime}
        onSelect={setTeamAtTime}
        label="What team was the player on? (if applicable)"
      />

      <button type="submit" disabled={busy || !allValid}
        style={{ ...buttonStyle, opacity: busy || !allValid ? 0.6 : 1 }}>
        {busy ? 'Uploading…' : 'Upload'}
      </button>
    </form>
  );
}


// -- Main Dashboard (single-open accordion) ------------------------------------

const SECTIONS = [
  { id: 'tip', title: 'Submit a News Tip', icon: '📰' },
  { id: 'player', title: 'Suggest a Missing Player', icon: '⚾' },
  { id: 'correction', title: 'Report a Correction', icon: '🔧' },
  { id: 'photo', title: 'Upload a Photo', icon: '📸' },
] as const;

export default function FanDashboard({
  displayName,
  homeHsid,
}: {
  displayName: string;
  homeHsid: string;
}) {
  const [openSection, setOpenSection] = useState<string | null>(null);

  const toggle = (id: string) => setOpenSection((cur) => (cur === id ? null : id));

  return (
    <div style={sectionStyle}>
      <p style={headerStyle}>Help Improve YAT?STATS</p>
      {SECTIONS.map((s) => (
        <div key={s.id} style={{ marginBottom: '4px' }}>
          <button type="button" onClick={() => toggle(s.id)} style={subHeaderStyle}>
            <span>{s.icon} &nbsp;{s.title}</span>
            <span style={{ color: 'var(--muted)', fontSize: '16px', fontWeight: 400 }}>
              {openSection === s.id ? '−' : '+'}
            </span>
          </button>
          {openSection === s.id && (
            <div style={formContainerStyle}>
              {s.id === 'tip' && <NewsTipForm senderName={displayName} />}
              {s.id === 'player' && <MissingPlayerForm defaultHsid={homeHsid} />}
              {s.id === 'correction' && <CorrectionForm senderName={displayName} />}
              {s.id === 'photo' && <PhotoUploadForm defaultHsid={homeHsid} />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
