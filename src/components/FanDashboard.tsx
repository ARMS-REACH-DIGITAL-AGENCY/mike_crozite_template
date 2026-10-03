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
        school_name: manual['mp_hs'],
        hsid: defaultHsid || null,
        grad_year: gradYear ? parseInt(gradYear, 10) : null,
        position: manual['mp_pos'] || null,
        level: manual['mp_level'] || null,
        current_team: manual['mp_team'] || null,
        notes: notes || null,
      });
      setOk(true); setMsg(r.message);
      setManual({}); setGradYear(''); setNotes('');
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
      <ManualPlayerFields prefix="mp" values={manual} onChange={setManualField} />
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
        playerid: player?.playerid || null,
        raw_player_name: player ? `${player.firstName} ${player.lastName}` : null,
        matched_hsid: player?.hsid || null,
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

function PhotoUploadForm({ defaultHsid }: { defaultHsid: string }) {
  const [player, setPlayer] = useState<PlayerResult | null>(null);
  const [purpose, setPurpose] = useState('flip_card');
  const [description, setDescription] = useState('');
  const [dateTaken, setDateTaken] = useState('');
  const [teamAtTime, setTeamAtTime] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !player) return;
    setBusy(true); setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', 'player');
      fd.append('playerid', player.playerId);
      fd.append('player_name', `${player.firstName} ${player.lastName}`);
      fd.append('hsid', player.schoolId || defaultHsid);
      fd.append('purpose', purpose);
      fd.append('description', description);
      fd.append('team_at_time', teamAtTime);
      if (dateTaken) fd.append('date_taken', dateTaken);
      const res = await fetch('/api/upload/image', { method: 'POST', credentials: 'include', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setOk(true); setMsg(json.message);
      setFile(null); setPlayer(null); setDescription(''); setDateTaken(''); setTeamAtTime('');
    } catch (err: any) {
      setOk(false); setMsg(err.message);
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit}>
      {msg && <p style={feedbackStyle(ok)}>{msg}</p>}
      <p style={disclaimerStyle}>
        For flip card and profile photos. This is <strong>not</strong> for career path
        timeline uploads — use the timeline on the player profile page for those.
      </p>
      <PlayerPicker selected={player} onSelect={setPlayer} label="Who is in this photo?" required />
      <Field label="What is this photo for?" required>
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)} style={inputStyle}>
          <option value="flip_card">Flip card front</option>
          <option value="profile_gallery">Profile photo gallery</option>
          <option value="news_article">News article image</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="What's in the photograph?" required>
        <input type="text" placeholder="e.g. Game action vs. Chandler, headshot, pitching delivery"
          value={description} onChange={(e) => setDescription(e.target.value)}
          required style={inputStyle} />
      </Field>
      <Field label="What team was the player on when this was taken?">
        <input type="text" placeholder="e.g. Hamilton HS (2023), Reno Aces"
          value={teamAtTime} onChange={(e) => setTeamAtTime(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Date Taken (if known)">
        <input type="date" value={dateTaken}
          onChange={(e) => setDateTaken(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Choose Photo" required>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => setFile(e.target.files?.[0] || null)} required
          style={{ ...inputStyle, padding: '8px 10px' }} />
      </Field>
      <button type="submit" disabled={busy || !file || !player}
        style={{ ...buttonStyle, opacity: busy || !file || !player ? 0.6 : 1 }}>
        {busy ? 'Uploading…' : 'Upload Photo'}
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
