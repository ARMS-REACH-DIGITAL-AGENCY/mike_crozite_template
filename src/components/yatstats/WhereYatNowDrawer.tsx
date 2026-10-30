'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import WhereYatProofCard, { type WhereYatProof } from './WhereYatProofCard';
import { normalizeWhereYatLink, WHERE_YAT_LINK_FIELDS, type WhereYatLinkField } from '@/lib/whereYatLinks';

type Target = { playerId: string; hsid: string; name: string; position?: string };
export const WHERE_YAT_OPEN = 'yat:where-yat-now-open';
export function openWhereYatNow(target: Target) {
  window.dispatchEvent(new CustomEvent<Target>(WHERE_YAT_OPEN, { detail: target }));
}

const PARTNERS_HREF = 'https://yatstats.com/partners/';
const FIELD_STYLES = { width: '100%', minHeight: 43, padding: '10px 11px', background: '#181818', color: '#f4f4f4', border: '1px solid #555', borderRadius: 2, fontFamily: 'Archivo,Arial,sans-serif', fontSize: 14, boxSizing: 'border-box' } as const;
const ACCENT = '#e9bf56';
const uiButton = { background: ACCENT, color: '#111', padding: '12px 16px', border: 0, borderRadius: 2, fontFamily: 'Oswald,Barlow Condensed,Arial Narrow,sans-serif', fontSize: 16, fontWeight: 800, letterSpacing: '.035em', cursor: 'pointer' } as const;
function requestSignIn() {
  document.body.classList.add('drawer-account-open', 'drawer-open');
  window.dispatchEvent(new CustomEvent('yat:acct-tab', { detail: 'signin' }));
}
export default function WhereYatNowDrawer() {
  const [target, setTarget] = useState<Target | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<WhereYatLinkField | null>(null);
  const [fan, setFan] = useState({ name: '', email: '' });
  const [proof, setProof] = useState<WhereYatProof | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const pendingAfterSignIn = useRef<Target | null>(null);

  useEffect(() => {
    setReady(true);
    const u = auth.currentUser;
    if (u) setFan({ name: u.displayName || '', email: u.email || '' });
    fetch('/api/auth/session', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(data => {
      const s = data?.authenticated ? data.session : null;
      if (!s) return;
      const name = [s.firstName, s.lastName].filter(Boolean).join(' ').trim() || s.displayName || '';
      setFan({ name, email: s.email || '' });
      const form = formRef.current;
      if (form) {
        const nameInput = form.elements.namedItem('displayName') as HTMLInputElement | null;
        const emailInput = form.elements.namedItem('email') as HTMLInputElement | null;
        if (nameInput && !nameInput.value.trim()) nameInput.value = name;
        if (emailInput && !emailInput.value.trim()) emailInput.value = s.email || '';
      }
    }).catch(() => {});
    const handler = async (e: Event) => {
      const d = (e as CustomEvent<Target>).detail;
      if (!d?.playerId || !d?.hsid) return;
      await auth.authStateReady?.();
      if (!auth.currentUser) {
        pendingAfterSignIn.current = d;
        requestSignIn();
        return;
      }
      pendingAfterSignIn.current = null;
      setTarget(d);
      setError('');
      setFieldError(null);
      setSuccess(false);
      setProof(null);
      setPhotoPreview(null);
      setLogoPreview(null);
      document.body.classList.add('drawer-open');
    };
    const stopWatchingAuth = onAuthStateChanged(auth, (user) => {
      if (!user || !pendingAfterSignIn.current) return;
      const d = pendingAfterSignIn.current;
      pendingAfterSignIn.current = null;
      setTarget(d);
      setError('');
      setSuccess(false);
      document.body.classList.add('drawer-open');
    });
    window.addEventListener(WHERE_YAT_OPEN, handler);
    const onClick = (event: MouseEvent) => {
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-where-yat-profile-player]');
      if (!element) return;
      event.preventDefault();
      const playerId = element.dataset.whereYatProfilePlayer || '';
      const hsid = element.dataset.whereYatProfileSchool || '';
      const name = element.dataset.whereYatProfileName || 'this alumnus';
      if (playerId && hsid) window.dispatchEvent(new CustomEvent(WHERE_YAT_OPEN, { detail: { playerId, hsid, name } }));
    };
    document.addEventListener('click', onClick);
    return () => { window.removeEventListener(WHERE_YAT_OPEN, handler); document.removeEventListener('click', onClick); stopWatchingAuth(); document.body.classList.remove('drawer-open'); };
  }, []);

  const close = () => {
    setTarget(null);
    setBusy(false);
    document.body.classList.remove('drawer-open');
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || busy) return;
    // Capture form synchronously: event.currentTarget is cleared after the first await.
    const data = new FormData(event.currentTarget);
    if (!proof) {
      const nextProof: WhereYatProof = {
        playerId: target.playerId, hsid: target.hsid, position: target.position,
        displayName:String(data.get('displayName') || ''),
        city:String(data.get('city')||''),state:String(data.get('state')||''),
        occupation:String(data.get('occupation')||''),company:String(data.get('company')||''),
        website:String(data.get('website')||''),linkedin:String(data.get('linkedin')||''),
        instagram:String(data.get('instagram')||''),facebook:String(data.get('facebook')||''),
        x:String(data.get('x')||''),story:String(data.get('story')||''),
        photoUrl:photoPreview,logoUrl:logoPreview,
      };
      setProof(nextProof);
      requestAnimationFrame(() => setTimeout(() => document.getElementById('where-yat-proof')?.scrollIntoView({behavior:'smooth',block:'nearest'}), 30));
      return;
    }
    data.set('proofConfirmed','yes');
    setBusy(true);
    setError('');
    setFieldError(null);
    for (const field of WHERE_YAT_LINK_FIELDS) {
      const result = normalizeWhereYatLink(field, String(data.get(field) || ''));
      if (result.error) {
        setError(result.error);
        setFieldError(field);
        (formRef.current?.elements.namedItem(field) as HTMLInputElement | null)?.focus();
        setBusy(false);
        return;
      }
      data.set(field, result.url);
    }
    try {
      await auth.authStateReady?.();
      const token = await auth.currentUser?.getIdToken().catch(() => '');
      if (!token) {
        pendingAfterSignIn.current = target;
        setTarget(null);
        requestSignIn();
        return;
      }
      data.set('idToken', token);
      data.set('playerId', target.playerId);
      data.set('hsid', target.hsid);
      const response = await fetch('/api/contribute/where-yat-now', { method: 'POST', body: data, credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (WHERE_YAT_LINK_FIELDS.includes(body.field)) {
          setFieldError(body.field);
          (formRef.current?.elements.namedItem(body.field) as HTMLInputElement | null)?.focus();
        }
        throw new Error(body.error || 'Unable to submit.');
      }
      setSuccess(true);
      setSubmissionId(Number(body.submissionId) || null);
      window.dispatchEvent(new CustomEvent('yat:where-yat-submitted', { detail: { playerId:target.playerId, hsid:target.hsid } }));
      formRef.current?.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to submit.');
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !target) return null;
  const field = (label: string, name: string, placeholder = '', required = false) => (
    <label style={{ display: 'block', fontFamily: 'Oswald,Barlow Condensed,Arial Narrow,sans-serif', fontSize: 13, fontWeight: 700, letterSpacing: '.055em', marginBottom: 13, color: '#ddd' }}>
      {label}
      <input style={{ ...FIELD_STYLES, marginTop: 6, borderColor: fieldError === name ? '#ffb3b3' : '#555' }} type={name === 'email' ? 'email' : 'text'} autoComplete={name === 'email' ? 'email' : name === 'displayName' ? 'name' : 'off'} name={name} defaultValue={name === 'displayName' ? fan.name : name === 'email' ? fan.email : undefined} placeholder={placeholder} required={required} maxLength={name === 'email' ? 220 : 300} aria-invalid={fieldError === name} onInput={() => { if (fieldError === name) { setFieldError(null); setError(''); } }} />
      {fieldError === name && <small style={{ color: '#ffb3b3', display: 'block', marginTop: 5, fontFamily: 'Archivo,Arial,sans-serif', letterSpacing: 0 }}>{error}</small>}
    </label>
  );
  return createPortal(
    <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 130000, background: 'rgba(0,0,0,.78)' }} onClick={close}>
      <aside role="dialog" aria-modal="true" aria-label="WHERE YAT NOW? alumni update"
        onClick={(e) => e.stopPropagation()}
        style={{ marginLeft: 'auto', width: 'min(100%,490px)', height: '100dvh', overflowY: 'auto', background: '#101010', color: '#f2f2f2', padding: '22px clamp(16px,4vw,26px) 54px', boxShadow: '-8px 0 30px #0009', fontFamily: 'Archivo,Arial,sans-serif', boxSizing: 'border-box', overscrollBehavior: 'contain' }}>
        <button type="button" onClick={close} aria-label="Close survey" style={{ float: 'right', fontSize: 26, border: '1px solid #595959', width: 38, height: 38, background: 'transparent', color: '#eee', cursor: 'pointer', borderRadius: 2 }}>×</button>
        <div style={{ color: ACCENT, fontFamily: 'Oswald,Barlow Condensed,Arial Narrow,sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '.12em', paddingTop: 7 }}>YAT?STATS / CONNECT · CONTRIBUTE · REMEMBER</div>
        <h2 style={{ fontFamily: 'Oswald,Barlow Condensed,Arial Narrow,sans-serif', fontSize: 32, lineHeight: 1.1, margin: '14px 0 6px', letterSpacing: '.035em' }}>WHERE YAT NOW?</h2>
        <div style={{ height: 2, width: 64, background: ACCENT, margin: '12px 0 15px' }} />
        <p style={{ fontSize: 14, lineHeight: 1.6, color: '#d0d0d0' }}>Reconnect with {target.name}. Share a free alumni update for the player's profile. All submissions are reviewed before publication.</p>
        {success ? (
          <div role="status" style={{ marginTop: 30, lineHeight: 1.6 }}>
            <h3 style={{ color: ACCENT, fontFamily: 'Oswald,Barlow Condensed,Arial Narrow,sans-serif', fontSize: 22 }}>UPDATE RECEIVED</h3>
            <p>Your proof is confirmed and the update is awaiting identity review. An email receipt will link back to your saved proof. Once approved, the update will appear on the player's profile.</p>
            {submissionId && <a href={`/${target.hsid}/where-yat-proof?submission=${submissionId}`} style={{color:ACCENT}}>VIEW MY SAVED PROOF ↗</a>}
            <p>Interested in promoting your business? Partnership details are on the YAT?STATS corporate site.</p>
            <a style={{ color: ACCENT, fontWeight: 800 }} href={PARTNERS_HREF} target="_blank" rel="noopener noreferrer">EXPLORE PARTNERSHIPS ↗</a>
            <p><button type="button" onClick={close} style={uiButton}>CLOSE</button></p>
          </div>
        ) : (
          <form ref={formRef} onSubmit={submit}>
            {field('YOUR NAME', 'displayName', 'First and last name', true)}
            {field('EMAIL (FOR FOLLOW-UP, NOT PUBLIC)', 'email', 'you@example.com', true)}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {field('CITY', 'city', 'City')}
              {field('STATE', 'state', 'State')}
            </div>
            {field('WHAT DO YOU DO THESE DAYS?', 'occupation', 'Career or current role')}
            {field('BUSINESS OR ORGANIZATION', 'company', 'Company name')}
            <label style={{display:'block',fontFamily:'Oswald,Barlow Condensed,Arial Narrow,sans-serif',fontSize:14,fontWeight:700,letterSpacing:'.055em',marginBottom:18}}>ADD YOUR COMPANY LOGO (OPTIONAL)
              <div style={{border:'2px dashed #b9a47b',padding:17,margin:'9px 0',background:'#222',textAlign:'center'}}>
                <div style={{fontSize:24,color:ACCENT}}>＋</div>
                <div>UPLOAD COMPANY LOGO</div>
                <div style={{fontFamily:'Archivo,Arial,sans-serif',fontSize:12,color:'#bbb',letterSpacing:0}}>Transparent PNG recommended. JPG or WebP also accepted. Max 5 MB.</div>
                {logoPreview && <img src={logoPreview} alt="Selected company logo" style={{display:'block',margin:'10px auto',maxHeight:100,maxWidth:'85%',objectFit:'contain',background:'#ddd',padding:6}} />}
                <input name="companyLogo" type="file" accept="image/png,image/jpeg,image/webp"
                  onChange={e=>{const file=e.target.files?.[0];if(file && file.size>5*1024*1024){setError('Company logo must be under 5 MB.');e.target.value='';return;}if(logoPreview)URL.revokeObjectURL(logoPreview);setLogoPreview(file?URL.createObjectURL(file):null);setProof(null);setError('');}}
                  style={{display:'block',margin:'12px auto',width:'100%',fontFamily:'Archivo,Arial,sans-serif',fontSize:13,letterSpacing:0}} />
              </div>
            </label>
            {field('BUSINESS WEBSITE (OPTIONAL)', 'website', 'yatstats.com')}
            {field('LINKEDIN (OPTIONAL)', 'linkedin', 'petedeluca or full profile URL')}
            {field('INSTAGRAM (OPTIONAL)', 'instagram', '@pcdaction')}
            {field('FACEBOOK (OPTIONAL)', 'facebook', 'petedeluca')}
            {field('X / TWITTER (OPTIONAL)', 'x', '@pcdaction')}
            <label style={{ display: 'block', fontFamily: 'Oswald,Barlow Condensed,Arial Narrow,sans-serif', fontSize: 13, fontWeight: 700, letterSpacing: '.055em', marginBottom: 15 }}>WHAT HAVE YOU BEEN UP TO?
              <textarea name="story" maxLength={2400} rows={4} style={{ ...FIELD_STYLES, resize: 'vertical', marginTop: 6 }} placeholder="Family, work, memories, and what matters to you today..." />
            </label>
            <label style={{ display: 'block', fontFamily: 'Oswald,Barlow Condensed,Arial Narrow,sans-serif', fontSize: 14, fontWeight: 700, marginBottom: 19, letterSpacing: '.055em' }}>ADD A RECENT PHOTO (OPTIONAL)
              <div style={{border:'2px dashed #e9bf56',padding:22,margin:'10px 0',background:'#222',textAlign:'center',minHeight:135}}>
                <div style={{fontSize:27,color:ACCENT}}>＋</div><div>UPLOAD YOUR PHOTO</div>
                <div style={{fontFamily:'Archivo,sans-serif',fontSize:12,color:'#bbb'}}>Tap to choose a recent photo, or leave this blank</div>
                {photoPreview && <img src={photoPreview} alt="Selected photo" style={{display:'block',margin:'12px auto',maxHeight:180,maxWidth:'100%',objectFit:'contain'}}/>}
                <input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={e=>{const file=e.target.files?.[0]; if(photoPreview) URL.revokeObjectURL(photoPreview);setPhotoPreview(file?URL.createObjectURL(file):null);setProof(null);}} style={{display:'block',margin:'12px auto',width:'100%',fontFamily:'Archivo,Arial,sans-serif',fontSize:13}}/>
              </div>
              <small style={{ display: 'block', fontWeight: 400, marginTop: 5, color: '#aaa', letterSpacing: 'normal', fontFamily: 'Archivo,Arial,sans-serif' }}>One photo, maximum 8 MB. Reviewed before publishing.</small>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18, fontSize: 13, lineHeight: 1.5, color: '#e1e1e1' }}>
              <input type="checkbox" name="sponsorship" value="yes" style={{ marginTop: 4, accentColor: ACCENT, width: 17, height: 17, flexShrink: 0 }} />
              I'm interested in hearing about optional advertising or partnership opportunities for my business.
            </label>
            <p style={{ fontSize: 11, lineHeight: 1.55, color: '#aaa' }}>By submitting, you authorize YAT?STATS to review and display approved public information and photos. Keep private contact details out of your public story. Submitting on someone else's behalf does not verify their identity.</p>
            {proof && <div id="where-yat-proof" style={{margin:'18px 0 12px'}}><h3 style={{fontFamily:'Oswald,sans-serif',fontSize:22,color:ACCENT}}>REVIEW YOUR PROOF</h3><WhereYatProofCard proof={proof} variant="full"/><p style={{fontSize:13,color:'#ccc'}}>Please confirm every detail. Your confirmation does not verify identity; an authorized reviewer must also approve publication.</p><button type="button" style={{...uiButton,background:'#333',color:'#fff',border:'1px solid #777',marginBottom:10}} onClick={()=>setProof(null)}>EDIT MY DETAILS</button></div>}
            {error && !fieldError && <p role="alert" style={{ color: '#ffb3b3', fontWeight: 700 }}>{error}</p>}
            <button type="submit" disabled={busy} style={{ ...uiButton, width: '100%', marginTop: 7, opacity: busy ? .65 : 1 }}>
              {busy ? 'SUBMITTING…' : proof ? 'CONFIRM PROOF & SUBMIT UPDATE' : 'REVIEW MY PROOF →'}
            </button>
            <p style={{ fontSize: 12, color: '#bbb', marginTop: 17, textAlign: 'center' }}>Business partnerships are optional and separate from this free update.</p>
            <p style={{ fontSize: 13, textAlign: 'center' }}><a href={PARTNERS_HREF} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, textDecoration: 'underline' }}>YAT?STATS Corporate Partnership Program ↗</a></p>
          </form>
        )}
      </aside>
    </div>,
    document.body,
  );
}
