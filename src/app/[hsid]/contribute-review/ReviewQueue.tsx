'use client';

// The Connect & Contribute review queue (reviewers only): fans' photos
// waiting for approval, and the latest corrections, tips and missing-player
// reports. Approving a photo puts it on the site.

import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { photoTypeLabel } from '@/lib/contribute';

type Photo = {
  id: string; playerid: string; hsid: string; purpose: string; url: string | null; date_taken: string | null;
  uploaded_at: string; player_name: string | null; school_name: string | null;
  details: { note?: string | null; season?: { year?: number; team?: string; label?: string } | null; cropped?: boolean; moderation?: { decision?: string; description?: string } | null; playerName?: string | null; by?: { name?: string; email?: string | null } };
};
type Tip = { id: string; submitted_at: string; intake_source: string; sender_name: string | null; raw_player_name: string | null; article_url: string; notes: string | null; status: string };
type Alumni = { id: number; playerid: string; hsid: string; display_name: string; contact_email: string; location_city: string | null; location_state: string | null; occupation: string | null; company_name: string | null; business_website: string | null; linkedin_url: string | null; instagram_url: string | null; facebook_url: string | null; x_url: string | null; story: string | null; photo_url: string | null; company_logo_url: string | null; sponsorship_interest: boolean; created_at: string; proof_confirmed_at:string|null; identity_review_method:string|null; identity_review_note:string|null; retirement_year:number|null;favorite_hs_memory:string|null;favorite_post_hs_memory:string|null;family_life:string|null;business_message:string|null;business_offer:string|null;business_contact_email:string|null;business_contact_phone:string|null;business_public_opt_in:boolean;private_teammate_tips:string|null;life_photos_json:Array<{web:string;full:string;thumb:string}>;alumni_claim_attested:boolean; };
type Missing = { id: string; created_at: string; player_name: string; grad_year: number | null; school_name: string | null; notes: string | null };

async function authHeaders(): Promise<Record<string, string>> {
  await auth.authStateReady?.();
  const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';
  return token ? { 'x-firebase-token': token } : {};
}

const when = (v: string) => new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Profile corrections remain review-only; only the explicit status + canonical
// team-ID pair has a direct approval action.
function proposedCommitment(tip: Tip): {status:string;teamId:string;teamName:string} | null {
  if (tip.intake_source!=='correction') return null;
  try {
    const detail=JSON.parse(tip.notes || '{}');
    const f=detail?.fields;
    if (detail?.kind!=='profile_update' || !f || typeof f!=='object' || Array.isArray(f) ||
        Object.keys(f).sort().join(',')!=='committed_teamid,status_label' ||
        !['COMMIT','UNCOMMITTED'].includes(f.status_label) || typeof f.committed_teamid!=='string') return null;
    return {status:f.status_label,teamId:f.committed_teamid,teamName:String(detail.commitTeamName || '')};
  } catch { return null; }
}

// Only a single, canonical team identity change is eligible for direct
// approval. Other player corrections continue through the review queue.
function proposedCurrentTeam(tip: Tip): {teamId:string;teamName:string;level:string} | null {
  if (tip.intake_source!=='correction') return null;
  try {
    const detail=JSON.parse(tip.notes || '{}');
    const f=detail?.fields;
    if (detail?.kind!=='profile_update' || !f || typeof f!=='object' || Array.isArray(f) ||
        Object.keys(f).sort().join(',')!=='current_team_name,current_teamid,level_label,status_label' ||
        f.status_label!=='ACTIVE' || typeof f.current_teamid!=='string' ||
        !/^\d{1,18}$/.test(f.current_teamid)) return null;
    return {teamId:f.current_teamid,teamName:String(f.current_team_name || ''),level:String(f.level_label || '')};
  } catch { return null; }
}

export default function ReviewQueue() {
  const [data, setData] = useState<{ photos: Photo[]; tips: Tip[]; missing: Missing[] } | null>(null);
  const [error, setError] = useState('');
  const [alumni, setAlumni] = useState<Alumni[]>([]);
  const [alumniError, setAlumniError] = useState('');
  const [identity, setIdentity] = useState<Record<number,{method:string;note:string}>>({});
  const [busy, setBusy] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    (async () => {
      const res = await fetch('/api/contribute/review', { credentials: 'include', cache: 'no-store', headers: await authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!live) return;
      if (!res.ok) setError(body?.error || 'Could not load the queue.');
      else setData(body);
      const alumniRes = await fetch('/api/contribute/where-yat-now/review', { credentials: 'include', cache: 'no-store', headers: await authHeaders() });
      const alumniBody = await alumniRes.json().catch(() => ({}));
      if (!live) return;
      if (alumniRes.ok) setAlumni(alumniBody.submissions || []);
      else setAlumniError(alumniBody.error || 'Could not load alumni review queue.');
    })();
    return () => { live = false; };
  }, []);

  const act = async (id: string, action: 'approve' | 'reject' | 'approve_commit' | 'reject_commit' | 'approve_team' | 'reject_team' | 'unpublish_scout') => {
    setBusy((b) => ({ ...b, [id]: action === 'unpublish_scout' ? 'Removing…' : action.startsWith('approve') ? 'Approving…' : 'Rejecting…' }));
    const res = await fetch('/api/contribute/review', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ id, action }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy((b) => ({ ...b, [id]: body?.error || 'That did not work.' }));
      return;
    }
    setData((d) => d ? ((action.endsWith('_commit') || action.endsWith('_team') || action === 'unpublish_scout')
      ? {...d, tips:d.tips.map(t=>t.id===id ? {...t,status:action.startsWith('approve')?'published':'rejected'} : t)}
      : {...d, photos:d.photos.filter((p) => p.id !== id)}) : d);
    setBusy(b=>{const next={...b};delete next[id];return next;});
  };

  useEffect(() => {
    if (!alumni.length) return;
    const id = new URLSearchParams(window.location.search).get('alumni');
    if (!id || !alumni.some(item => String(item.id) === id)) return;
    requestAnimationFrame(() => document.getElementById('alumni-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [alumni]);

  const reviewAlumni = async (id: number, status: 'approved' | 'rejected') => {
    const evidence=identity[id]||{method:'',note:''};
    setBusy(b => ({ ...b, ['alumni-' + id]: 'Saving…' }));
    const res = await fetch('/api/contribute/where-yat-now/review', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ id, status,identityMethod:evidence.method,identityNote:evidence.note }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.ok) setBusy(b => ({ ...b, ['alumni-' + id]: result.error || 'Review failed.' }));
    else { setAlumni(items => items.filter(item => item.id !== id)); setBusy(b => { const next={...b}; delete next['alumni-' + id]; return next; }); }
  };
  const focusId = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('alumni') || '';
  if (error) return <div className="ycr"><p className="ycr-error">{error}</p><Style /></div>;
  if (!data) return <div className="ycr"><p>Loading…</p><Style /></div>;

  return (
    <div className="ycr">
      <h2>Where YAT Now? alumni updates waiting ({alumni.length})</h2>
      {alumniError && <p className="ycr-error">{alumniError}</p>}
      {alumni.length === 0 && !alumniError && <p className="ycr-muted">No pending alumni updates.</p>}
      <div className="ycr-grid">
        {alumni.map(item => <article key={item.id} id={'alumni-' + item.id} className="ycr-card" style={{ outline: focusId === String(item.id) ? '2px solid #e9bf56' : undefined, scrollMarginTop: 100 }}>
          <h3 style={{ fontFamily: 'Oswald,sans-serif', fontSize: 24 }}>{item.display_name}</h3>
          <p className="ycr-muted">School #{item.hsid} · Submission #{item.id} · {when(item.created_at)}</p>
          {item.photo_url && <img src={item.photo_url} alt={'Submitted photo of ' + item.display_name} />}
          {item.company_logo_url && <div><strong>Submitted company logo (requires approval):</strong><img src={item.company_logo_url} alt={'Company logo for '+(item.company_name||item.display_name)} style={{width:130,height:95,objectFit:'contain',display:'block',background:'#eee'}} /></div>}
          {item.story && <p style={{whiteSpace:'pre-wrap'}}>{item.story}</p>}
          {item.occupation && <p>Occupation: {item.occupation}</p>}
          {item.company_name && <p>Organization: {item.company_name}</p>}
          {[item.location_city,item.location_state].filter(Boolean).length > 0 && <p>Location: {[item.location_city,item.location_state].filter(Boolean).join(', ')}</p>}
          {[item.business_website,item.linkedin_url,item.instagram_url,item.facebook_url,item.x_url].filter(Boolean).map(url => <p key={url}><a href={url!} target="_blank" rel="noopener noreferrer" style={{color:'#e9bf56'}}>{url}</a></p>)}
          {item.retirement_year&&<p>Retired from baseball: {item.retirement_year}</p>}
          {([['High school memory',item.favorite_hs_memory],['Post-graduation baseball memory',item.favorite_post_hs_memory],['Family and life',item.family_life],['Business message',item.business_message],['Special offer',item.business_offer]] as const).map(([label,value])=>value&&<section key={label}><strong>{label}</strong><p style={{whiteSpace:'pre-wrap'}}>{value}</p></section>)}
          {Array.isArray(item.life_photos_json)&&item.life_photos_json.length>0&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{item.life_photos_json.map((photo,i)=><img key={i} src={photo.web} alt={'Submitted life photo '+(i+1)} style={{width:130,height:110,objectFit:'contain'}} />)}</div>}
          <p>Personal claim attested: {item.alumni_claim_attested?'Yes (not independently verified)':'No / legacy submission'}</p>
          {item.business_public_opt_in&&<p>Authorized public business contact: {[item.business_contact_email,item.business_contact_phone].filter(Boolean).join(' / ')}</p>}
          {item.private_teammate_tips&&<section style={{padding:12,border:'2px dashed #e9bf56'}}><strong>PRIVATE TEAMMATE LEADS — DO NOT PUBLISH</strong><p style={{whiteSpace:'pre-wrap'}}>{item.private_teammate_tips}</p></section>}
          <p className="ycr-muted">Contact (private): {item.contact_email}</p>
          <p className="ycr-muted">Partnership interest: {item.sponsorship_interest ? 'Yes' : 'No'}</p>
          <p style={{color:item.proof_confirmed_at?'#e9bf56':'#ffb3b3'}}>Contributor proof: {item.proof_confirmed_at?'CONFIRMED':'NOT CONFIRMED'}</p>
          <label>IDENTITY CHECK (REQUIRED TO APPROVE)
           <select value={identity[item.id]?.method||''} onChange={e=>setIdentity(prev=>({...prev,[item.id]:{method:e.target.value,note:prev[item.id]?.note||''}}))} style={{display:'block',width:'100%',padding:9,background:'#1c1c1c',color:'#fff'}}>
             <option value="">Choose an independent check</option>
             <option value="known-person">Reviewer personally knows the alumnus</option>
             <option value="coach-roster">Coach/roster confirmation</option>
             <option value="verified-school-contact">Verified school representative</option>
             <option value="verified-direct-contact">Direct identity confirmation</option>
           </select>
          </label>
          <label>IDENTITY VERIFICATION NOTES
            <textarea value={identity[item.id]?.note||''} onChange={e=>setIdentity(prev=>({...prev,[item.id]:{method:prev[item.id]?.method||'',note:e.target.value}}))} placeholder="Who or what independently confirmed identity? (not just the contributor's own claim)" maxLength={1000} rows={3} style={{display:'block',width:'100%',padding:9,background:'#1c1c1c',color:'#fff'}}/>
          </label>
          {busy['alumni-' + item.id] && <p role="alert">{busy['alumni-' + item.id]}</p>}
          <div className="ycr-actions">
            <button type="button" className="ycr-btn ycr-yes" disabled={!!busy['alumni-' + item.id]||!item.proof_confirmed_at||!identity[item.id]?.method||(identity[item.id]?.note||'').trim().length<12} onClick={() => reviewAlumni(item.id,'approved')}>Approve update</button>
            <button type="button" className="ycr-btn" disabled={!!busy['alumni-' + item.id]} onClick={() => reviewAlumni(item.id,'rejected')}>Reject</button>
          </div>
        </article>)}
      </div>
      <h2>Photos waiting ({data.photos.length})</h2>
      {data.photos.length === 0 ? <p className="ycr-muted">Nothing waiting.</p> : null}
      <div className="ycr-grid">
        {data.photos.map((p) => {
          const type = photoTypeLabel(p.purpose);
          const who = p.player_name || p.details.playerName || '';
          return (
            <div className="ycr-card" key={p.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.url ? <img src={p.url} alt="" /> : null}
              <div className="ycr-meta">
                <b>{type}</b>
                <span>{who ? `${who}${p.playerid ? '' : ' (not on the site yet)'}` : p.school_name || ''}</span>
                {p.school_name && who ? <span className="ycr-muted">{p.school_name}</span> : null}
                <span className="ycr-muted">
                  {p.details.season
                    ? [p.details.season.year, p.details.season.team, p.details.season.label].filter(Boolean).join(' · ')
                    : p.date_taken ? new Date(p.date_taken).getUTCFullYear() : ''}
                </span>
                {p.details.note ? <span>“{p.details.note}”</span> : null}
                {p.details.moderation?.description ? <span className="ycr-muted">Automatic check: unsure. {p.details.moderation.description}</span> : null}
                <span className="ycr-muted">From {p.details.by?.name || 'a fan'}{p.details.by?.email ? ` (${p.details.by.email})` : ''} · {when(p.uploaded_at)}</span>
                {busy[p.id] ? <span className="ycr-muted">{busy[p.id]}</span> : null}
              </div>
              <div className="ycr-actions">
                <button type="button" className="ycr-btn ycr-yes" onClick={() => act(p.id, 'approve')} disabled={!!busy[p.id]}>Approve: put it on the site</button>
                <button type="button" className="ycr-btn" onClick={() => act(p.id, 'reject')} disabled={!!busy[p.id]}>Reject</button>
              </div>
            </div>
          );
        })}
      </div>

      <h2>Corrections and news tips</h2>
      {data.tips.length === 0 ? <p className="ycr-muted">None yet.</p> : null}
      <ul className="ycr-list">
        {data.tips.map((t) => {
          const commit=proposedCommitment(t);
          const currentTeam=proposedCurrentTeam(t);
          const reviewable=!!commit && ['new','needs_review'].includes(t.status);
          const reviewableTeam=!!currentTeam && ['new','needs_review'].includes(t.status);
          return <li key={t.id}>
            <b>{commit ? 'College commitment' : currentTeam ? 'Current-team change' : t.intake_source === 'correction' ? 'Correction' : t.intake_source === 'social_scout' ? 'Instagram scout tip' : 'News tip'}</b>
            {t.raw_player_name ? ` · ${t.raw_player_name}` : ''} · <span className="ycr-muted">{t.sender_name || 'a fan'}, {when(t.submitted_at)}</span> · <span className="ycr-muted">{t.status === 'published' ? 'Published' : t.status === 'rejected' ? 'Rejected' : t.status === 'needs_review' ? 'Needs review' : 'New'}</span>
            {commit ? <div><strong>{commit.status === 'COMMIT' ? `${commit.teamName || commit.teamId} COMMIT` : 'UNCOMMITTED'}</strong>
              {commit.teamId ? ` · Team ID: ${commit.teamId}` : ' · Clear existing commitment'}</div>
              : currentTeam ? <div><strong>{currentTeam.teamName || currentTeam.teamId}</strong>
                {currentTeam.level ? ` · ${currentTeam.level}` : ''} · Team ID: {currentTeam.teamId}</div>
              : t.notes ? <div>{t.notes}</div> : null}
            {t.article_url ? <div><a href={t.article_url} target="_blank" rel="noopener noreferrer">{t.article_url}</a></div> : null}
            {t.intake_source === 'social_scout' && t.status === 'published' ? <div className="ycr-actions">
              <button type="button" className="ycr-btn" disabled={!!busy[t.id]}
                onClick={()=>act(t.id,'unpublish_scout')}>Remove from News</button>
              {busy[t.id] ? <span className="ycr-muted">{busy[t.id]}</span> : null}
            </div> : null}
            {reviewable ? <div className="ycr-actions">
              <button type="button" className="ycr-btn ycr-yes" disabled={!!busy[t.id]}
                onClick={()=>act(t.id,'approve_commit')}>Approve commitment</button>
              <button type="button" className="ycr-btn" disabled={!!busy[t.id]}
                onClick={()=>act(t.id,'reject_commit')}>Reject</button>
              {busy[t.id] ? <span className="ycr-muted">{busy[t.id]}</span> : null}
            </div> : null}
            {reviewableTeam ? <div className="ycr-actions">
              <button type="button" className="ycr-btn ycr-yes" disabled={!!busy[t.id]}
                onClick={()=>act(t.id,'approve_team')}>Approve team change</button>
              <button type="button" className="ycr-btn" disabled={!!busy[t.id]}
                onClick={()=>act(t.id,'reject_team')}>Reject</button>
              {busy[t.id] ? <span className="ycr-muted">{busy[t.id]}</span> : null}
            </div> : null}
          </li>;
        })}
      </ul>

      <h2>Missing players</h2>
      {data.missing.length === 0 ? <p className="ycr-muted">None yet.</p> : null}
      <ul className="ycr-list">
        {data.missing.map((m) => (
          <li key={m.id}>
            <b>{m.player_name}</b>{m.grad_year ? `, class of ${m.grad_year}` : ''}{m.school_name ? ` · ${m.school_name}` : ''} · <span className="ycr-muted">{when(m.created_at)}</span>
            {m.notes ? <div className="ycr-muted">{m.notes}</div> : null}
          </li>
        ))}
      </ul>
      <Style />
    </div>
  );
}

function Style() {
  return (
    <style jsx global>{`
      .ycr { max-width: 1100px; margin: 0 auto; padding: 16px 16px 60px; color: var(--ink); }
      .ycr h2 { font: 500 24px/1.1 Oswald, sans-serif; letter-spacing: .05em; margin: 24px 0 10px; }
      .ycr-muted { opacity: .65; }
      .ycr-error { color: #ff6b6b; }
      .ycr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
      .ycr-card { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--line); border-radius: 10px; padding: 10px; }
      .ycr-card img { width: 100%; aspect-ratio: 5/7; object-fit: contain; background: rgba(255,255,255,.05); border-radius: 6px; }
      .ycr-meta { display: flex; flex-direction: column; gap: 3px; font-size: 13px; line-height: 1.35; }
      .ycr-actions { display: flex; gap: 6px; flex-wrap: wrap; }
      .ycr-btn { min-height: 38px; padding: 0 12px; border-radius: 8px; border: 1px solid #FFD700; background: transparent; color: #FFD700; font: 500 14px/1 Oswald, sans-serif; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
      .ycr-yes { background: #FFD700; color: #000; }
      .ycr-btn:disabled { opacity: .5; }
      .ycr-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; font-size: 13px; line-height: 1.45; }
      .ycr-list li { border-bottom: 1px solid var(--line); padding-bottom: 8px; word-break: break-word; }
      .ycr-list a { color: #FFD700; }
    `}</style>
  );
}
