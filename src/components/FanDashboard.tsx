'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// FanDashboard — "HELP IMPROVE YAT?STATS" sections for the account drawer.
// Lets logged-in fans submit news tips, suggest missing players, report
// corrections, and upload photos. All submissions go through review.
// ---------------------------------------------------------------------------

const sectionStyle: React.CSSProperties = {
  borderTop: '1px solid var(--line)',
  paddingTop: '16px',
  marginTop: '16px',
};

const headerStyle: React.CSSProperties = {
  fontSize: '16px',
  marginBottom: '12px',
  fontFamily: '"Bebas Neue", Oswald, sans-serif',
  letterSpacing: '.06em',
  color: 'var(--gold)',
};

const subHeaderStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  padding: '10px 0',
  cursor: 'pointer',
  fontSize: '13px',
  fontFamily: '"Bebas Neue", Oswald, sans-serif',
  letterSpacing: '.05em',
  color: 'var(--fg)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--line)',
  background: 'rgba(255, 255, 255, .06)',
  color: 'var(--ink)',
  fontSize: '13px',
  marginBottom: '8px',
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  background: 'var(--gold)',
  color: '#000',
  border: 'none',
  borderRadius: '8px',
  fontFamily: '"Bebas Neue", Oswald, sans-serif',
  fontSize: '13px',
  letterSpacing: '.06em',
  cursor: 'pointer',
  marginTop: '4px',
  marginBottom: '12px',
};

const feedbackStyle = (ok: boolean): React.CSSProperties => ({
  fontSize: '12px',
  color: ok ? '#4ade80' : '#f87171',
  marginBottom: '8px',
});

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

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid var(--line)' }}>
      <button type="button" onClick={() => setOpen(!open)} style={subHeaderStyle}>
        <span>{title}</span>
        <span style={{ color: 'var(--muted)' }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div style={{ paddingBottom: '12px' }}>{children}</div>}
    </div>
  );
}

function NewsTipForm({ senderName }: { senderName: string }) {
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const r = await postJson('/api/tips/news', { article_url: url, notes, sender_name: senderName });
      setOk(true);
      setMsg(r.message);
      setUrl('');
      setNotes('');
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
      <input
        type="url"
        placeholder="Article URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
        style={inputStyle}
      />
      <textarea
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        style={{ ...inputStyle, resize: 'vertical' }}
      />
      <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Sending…' : 'Submit Tip'}
      </button>
    </form>
  );
}

function MissingPlayerForm() {
  const [name, setName] = useState('');
  const [gradYear, setGradYear] = useState('');
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
        grad_year: gradYear || null,
        notes,
      });
      setOk(true);
      setMsg(r.message);
      setName('');
      setGradYear('');
      setNotes('');
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
      <input
        type="text"
        placeholder="Player name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        style={inputStyle}
      />
      <input
        type="number"
        placeholder="Grad year (optional)"
        value={gradYear}
        onChange={(e) => setGradYear(e.target.value)}
        min={1950}
        max={2040}
        style={inputStyle}
      />
      <textarea
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        style={{ ...inputStyle, resize: 'vertical' }}
      />
      <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Sending…' : 'Suggest Player'}
      </button>
    </form>
  );
}

function CorrectionForm({ senderName }: { senderName: string }) {
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
        correction,
        page_url: typeof window !== 'undefined' ? window.location.href : '',
        sender_name: senderName,
      });
      setOk(true);
      setMsg(r.message);
      setCorrection('');
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
      <textarea
        placeholder="What's wrong? (wrong team, bad photo, incorrect stats…)"
        value={correction}
        onChange={(e) => setCorrection(e.target.value)}
        required
        rows={3}
        style={{ ...inputStyle, resize: 'vertical' }}
      />
      <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Sending…' : 'Report Correction'}
      </button>
    </form>
  );
}

function PhotoUploadForm() {
  const [category, setCategory] = useState<'school' | 'player'>('player');
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
      const res = await fetch('/api/upload/image', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setOk(true);
      setMsg(json.message);
      setFile(null);
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
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <button
          type="button"
          onClick={() => setCategory('player')}
          style={{
            ...buttonStyle,
            marginBottom: 0,
            background: category === 'player' ? 'var(--gold)' : 'transparent',
            color: category === 'player' ? '#000' : 'var(--fg)',
            border: '1px solid var(--line)',
          }}
        >
          Player Photo
        </button>
        <button
          type="button"
          onClick={() => setCategory('school')}
          style={{
            ...buttonStyle,
            marginBottom: 0,
            background: category === 'school' ? 'var(--gold)' : 'transparent',
            color: category === 'school' ? '#000' : 'var(--fg)',
            border: '1px solid var(--line)',
          }}
        >
          School Image
        </button>
      </div>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        style={{ ...inputStyle, padding: '8px' }}
      />
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

export default function FanDashboard({ displayName }: { displayName: string }) {
  return (
    <div style={sectionStyle}>
      <p style={headerStyle}>🤝 Help Improve YAT?STATS</p>
      <Collapsible title="📰 Submit a News Tip">
        <NewsTipForm senderName={displayName} />
      </Collapsible>
      <Collapsible title="⚾ Suggest a Missing Player">
        <MissingPlayerForm />
      </Collapsible>
      <Collapsible title="🔧 Report a Correction">
        <CorrectionForm senderName={displayName} />
      </Collapsible>
      <Collapsible title="📸 Upload a Photo">
        <PhotoUploadForm />
      </Collapsible>
    </div>
  );
}
