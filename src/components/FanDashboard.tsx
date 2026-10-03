'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// FanDashboard — "HELP IMPROVE YAT?STATS" sections for the account drawer.
// Lets logged-in fans submit news tips, suggest missing players, report
// corrections, and upload photos. All submissions go through review.
// ---------------------------------------------------------------------------

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

function Collapsible({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: '4px' }}>
      <button type="button" onClick={() => setOpen(!open)} style={subHeaderStyle}>
        <span>{icon} &nbsp;{title}</span>
        <span style={{ color: 'var(--muted)', fontSize: '16px', fontWeight: 400 }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div style={formContainerStyle}>{children}</div>}
    </div>
  );
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

// ---------------------------------------------------------------------------
// News Tip Form
// ---------------------------------------------------------------------------
function NewsTipForm({ senderName }: { senderName: string }) {
  const [url, setUrl] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const r = await postJson('/api/tips/news', {
        article_url: url,
        raw_player_name: playerName || null,
        notes,
        sender_name: senderName,
      });
      setOk(true);
      setMsg(r.message);
      setUrl(''); setPlayerName(''); setNotes('');
    } catch (err: any) {
      setOk(false);
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {msg && <p style={feedbackStyle(ok)}>{msg}</p>}
      <Field label="Article URL" required>
        <input
          type="url"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          style={inputStyle}
        />
      </Field>
      <Field label="Player this is about">
        <input
          type="text"
          placeholder="e.g. Cody Bellinger"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="Notes">
        <textarea
          placeholder="Why is this newsworthy?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>
      <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Submitting…' : 'Submit Tip'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Missing Player Form
// ---------------------------------------------------------------------------
function MissingPlayerForm({ defaultHsid }: { defaultHsid: string }) {
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [hsid, setHsid] = useState(defaultHsid);
  const [gradYear, setGradYear] = useState('');
  const [position, setPosition] = useState('');
  const [currentTeam, setCurrentTeam] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const r = await postJson('/api/tips/missing-player', {
        player_name: name,
        school_name: school || null,
        hsid: hsid || null,
        grad_year: gradYear ? parseInt(gradYear, 10) : null,
        position: position || null,
        current_team: currentTeam || null,
        notes: notes || null,
      });
      setOk(true);
      setMsg(r.message);
      setName(''); setSchool(''); setGradYear(''); setPosition(''); setCurrentTeam(''); setNotes('');
    } catch (err: any) {
      setOk(false);
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {msg && <p style={feedbackStyle(ok)}>{msg}</p>}
      <Field label="Player Name" required>
        <input
          type="text"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={inputStyle}
        />
      </Field>
      <Field label="High School" required>
        <input
          type="text"
          placeholder="e.g. Hamilton High School"
          value={school}
          onChange={(e) => setSchool(e.target.value)}
          required
          style={inputStyle}
        />
      </Field>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <Field label="Grad Year">
            <input
              type="number"
              placeholder="e.g. 2020"
              value={gradYear}
              onChange={(e) => setGradYear(e.target.value)}
              min={1950}
              max={2040}
              style={inputStyle}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Position">
            <input
              type="text"
              placeholder="e.g. SS, RHP"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>
      </div>
      <Field label="Current Team / Level">
        <input
          type="text"
          placeholder="e.g. Arizona Diamondbacks (AAA)"
          value={currentTeam}
          onChange={(e) => setCurrentTeam(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="Additional Notes">
        <textarea
          placeholder="Anything else we should know?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>
      <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Submitting…' : 'Suggest Player'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Correction Form
// ---------------------------------------------------------------------------
function CorrectionForm({ senderName }: { senderName: string }) {
  const [correctionType, setCorrectionType] = useState('player_info');
  const [playerName, setPlayerName] = useState('');
  const [correction, setCorrection] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const r = await postJson('/api/tips/correction', {
        correction_type: correctionType,
        raw_player_name: playerName || null,
        correction,
        page_url: typeof window !== 'undefined' ? window.location.href : '',
        sender_name: senderName,
      });
      setOk(true);
      setMsg(r.message);
      setCorrection(''); setPlayerName('');
    } catch (err: any) {
      setOk(false);
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {msg && <p style={feedbackStyle(ok)}>{msg}</p>}
      <Field label="What's wrong?">
        <select
          value={correctionType}
          onChange={(e) => setCorrectionType(e.target.value)}
          style={inputStyle}
        >
          <option value="player_info">Player info (team, stats, bio)</option>
          <option value="photo">Wrong or bad photo</option>
          <option value="missing_player">Player missing from site</option>
          <option value="school_info">School info</option>
          <option value="other">Something else</option>
        </select>
      </Field>
      <Field label="Player Name (if applicable)">
        <input
          type="text"
          placeholder="e.g. Cody Bellinger"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="Describe the issue" required>
        <textarea
          placeholder="What's incorrect and what should it be?"
          value={correction}
          onChange={(e) => setCorrection(e.target.value)}
          required
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>
      <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Submitting…' : 'Report Correction'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Photo Upload Form
// ---------------------------------------------------------------------------
function PhotoUploadForm({ defaultHsid }: { defaultHsid: string }) {
  const [category, setCategory] = useState<'player' | 'school'>('player');
  const [playerName, setPlayerName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [description, setDescription] = useState('');
  const [dateTaken, setDateTaken] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', category);
      fd.append('player_name', playerName);
      fd.append('school_name', schoolName);
      fd.append('description', description);
      if (dateTaken) fd.append('date_taken', dateTaken);
      const res = await fetch('/api/upload/image', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setOk(true);
      setMsg(json.message);
      setFile(null); setPlayerName(''); setSchoolName(''); setDescription(''); setDateTaken('');
    } catch (err: any) {
      setOk(false);
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px',
    background: active ? 'var(--gold)' : 'transparent',
    color: active ? '#000' : 'var(--fg)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    fontFamily: '"Bebas Neue", Oswald, sans-serif',
    fontSize: '13px',
    letterSpacing: '.06em',
    cursor: 'pointer',
  });

  return (
    <form onSubmit={submit}>
      {msg && <p style={feedbackStyle(ok)}>{msg}</p>}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
        <button type="button" onClick={() => setCategory('player')} style={toggleStyle(category === 'player')}>
          Player Photo
        </button>
        <button type="button" onClick={() => setCategory('school')} style={toggleStyle(category === 'school')}>
          School Image
        </button>
      </div>
      {category === 'player' ? (
        <Field label="Player Name" required>
          <input
            type="text"
            placeholder="Who is in this photo?"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            required
            style={inputStyle}
          />
        </Field>
      ) : (
        <Field label="School Name" required>
          <input
            type="text"
            placeholder="Which school is this for?"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            required
            style={inputStyle}
          />
        </Field>
      )}
      <Field label="Photo Description" required>
        <input
          type="text"
          placeholder="e.g. Game action vs. Chandler, headshot, team photo"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          style={inputStyle}
        />
      </Field>
      <Field label="Date Taken (if known)">
        <input
          type="date"
          value={dateTaken}
          onChange={(e) => setDateTaken(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="Choose Photo" required>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required
          style={{ ...inputStyle, padding: '8px 10px' }}
        />
      </Field>
      <button
        type="submit"
        disabled={busy || !file}
        style={{ ...buttonStyle, opacity: busy || !file ? 0.6 : 1 }}
      >
        {busy ? 'Uploading…' : 'Upload Photo'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------
export default function FanDashboard({
  displayName,
  homeHsid,
}: {
  displayName: string;
  homeHsid: string;
}) {
  return (
    <div style={sectionStyle}>
      <p style={headerStyle}>Help Improve YAT?STATS</p>
      <Collapsible title="Submit a News Tip" icon="📰">
        <NewsTipForm senderName={displayName} />
      </Collapsible>
      <Collapsible title="Suggest a Missing Player" icon="⚾">
        <MissingPlayerForm defaultHsid={homeHsid} />
      </Collapsible>
      <Collapsible title="Report a Correction" icon="🔧">
        <CorrectionForm senderName={displayName} />
      </Collapsible>
      <Collapsible title="Upload a Photo" icon="📸">
        <PhotoUploadForm defaultHsid={homeHsid} />
      </Collapsible>
    </div>
  );
}
