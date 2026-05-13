'use client';

import { useEffect } from 'react';

const TAB_IDS = ['ppTab-schedule', 'ppTab-stats', 'ppTab-news', 'ppTab-social', 'ppTab-connect', 'ppTab-upload'];
const STAGES = ['Youth Baseball', 'Middle School', 'High School', 'College', 'Minor Leagues', 'Major Leagues', 'Fan Memory'];

type SessionPayload = {
  authenticated?: boolean;
  session?: { email?: string; firstName?: string | null; lastName?: string | null; role?: string | null; plan?: string | null; homeSchoolName?: string | null };
};

function esc(value: unknown) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function normalizeHash(value?: string | null) {
  const hash = value || window.location.hash || '#ppTab-stats';
  if (hash === '#ppTab-influence') return '#ppTab-upload';
  return TAB_IDS.includes(hash.replace('#', '')) ? hash : '#ppTab-stats';
}

function sessionDisplayName(session?: SessionPayload['session']) {
  const name = [session?.firstName, session?.lastName].map((v) => String(v || '').trim()).filter(Boolean).join(' ');
  return name || String(session?.email || 'Signed-in fan').trim();
}

function buildSignInGate(playerName: string) {
  const firstName = String(playerName || 'this player').split(' ')[0] || 'this player';
  return `<div class="profile-upload-panel profile-upload-gate"><div class="profile-upload-copy"><div class="profile-upload-kicker">The Golden Line</div><h2>Sign in to add a memory to ${esc(firstName)}'s timeline.</h2><p>Fan-submitted photos are tied to a registered YAT?STATS fan account so we know who submitted each memory and can handle review updates safely.</p><div class="profile-upload-gate-actions"><a href="/login">Log In</a><a href="/signup">Join Free</a></div></div></div>`;
}

function buildUploadForm(playerName: string, session?: SessionPayload['session']) {
  const firstName = String(playerName || 'this player').split(' ')[0] || 'this player';
  const fanName = sessionDisplayName(session);
  const fanMeta = [session?.plan || session?.role || 'Fan', session?.homeSchoolName].filter(Boolean).join(' · ');
  return `<div class="profile-upload-panel"><div class="profile-upload-copy"><div class="profile-upload-kicker">The Golden Line</div><h2>Upload a memory from ${esc(firstName)}'s baseball journey.</h2><p>Add a photo from youth baseball, school ball, college, pro ball, or a fan moment. The approximate date is required so the memory lands in the right place.</p></div><form class="profile-upload-form" id="goldenLineUploadForm"><input type="hidden" name="playerName" value="${esc(playerName)}" /><div class="profile-upload-identity profile-upload-wide"><span>Posting as</span><strong>${esc(fanName)}</strong>${fanMeta ? `<em>${esc(fanMeta)}</em>` : ''}</div><label>Memory type<select name="stage">${STAGES.map((stage) => `<option value="${esc(stage)}">${esc(stage)}</option>`).join('')}</select></label><label>Approx. date taken<input name="photoTakenDate" type="date" required /></label><label class="profile-upload-wide">Relationship / context<input name="relationship" placeholder="Friend, parent, coach, teammate, fan..." /></label><label class="profile-upload-wide">Memory title<input name="title" placeholder="Example: From teammate to foe" /></label><label class="profile-upload-wide">Caption / memory<textarea name="caption" rows="3" placeholder="I remember this because..."></textarea></label><fieldset class="profile-upload-privacy profile-upload-wide"><legend>Visibility</legend><label><input type="radio" name="visibility" value="public" checked /> Public after review</label><label><input type="radio" name="visibility" value="private" /> Private / only my account</label></fieldset><label>Upload photo<input name="photo" id="goldenLinePhotoInput" type="file" accept="image/*" required /></label><div class="profile-upload-preview" id="goldenLinePreview"><span>Selected photo preview</span></div><div class="profile-upload-actions"><button type="submit">Submit Memory</button><span id="goldenLineUploadStatus">Submitted photos are saved as pending memories.</span></div></form></div>`;
}

async function getSessionPayload(): Promise<SessionPayload> {
  try {
    const res = await fetch('/api/auth/session', { cache: 'no-store' });
    return await res.json();
  } catch {
    return { authenticated: false };
  }
}

async function ensureUploadForm(playerName: string) {
  const uploadPanel = document.getElementById('ppTab-upload') as HTMLElement | null;
  if (!uploadPanel) return;
  const sessionPayload = await getSessionPayload();
  const shouldGate = !sessionPayload.authenticated || !sessionPayload.session?.email;
  const mode = shouldGate ? 'gate' : 'form';
  if (uploadPanel.getAttribute('data-upload-mode') === mode && uploadPanel.querySelector(shouldGate ? '.profile-upload-gate' : '#goldenLineUploadForm')) return;
  uploadPanel.setAttribute('data-upload-mode', mode);
  uploadPanel.innerHTML = shouldGate ? buildSignInGate(playerName) : buildUploadForm(playerName, sessionPayload.session);
}

function activate(hashValue?: string | null) {
  const zone = document.getElementById('playerFunZone');
  if (!zone) return;
  const hash = normalizeHash(hashValue);
  const activeId = hash.replace('#', '');

  TAB_IDS.forEach((id) => {
    const panel = document.getElementById(id) as HTMLElement | null;
    if (!panel) return;
    const isActive = id === activeId;
    panel.classList.toggle('pp-fz-panel-active', isActive);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    panel.hidden = !isActive;
  });

  document.querySelectorAll<HTMLAnchorElement>('.pp-fz-tab').forEach((tab) => {
    if (tab.getAttribute('href') === '#ppTab-influence') {
      tab.href = '#ppTab-upload';
      tab.innerHTML = '<i class="ri-upload-cloud-line" aria-hidden="true"></i><span>Upload</span>';
    }
    tab.classList.toggle('pp-fz-tab-active', normalizeHash(tab.getAttribute('href')) === hash);
  });

  if (window.location.hash === '#ppTab-influence') history.replaceState(null, '', `${window.location.pathname}${window.location.search}#ppTab-upload`);
}

async function parseApiResponse(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const trimmed = text.trim();
    throw new Error(trimmed ? `Upload failed: ${trimmed.slice(0, 180)}` : 'Upload failed.');
  }
}

export default function ProfileFunZoneStabilizer({ playerId, hsid, playerName }: { playerId: string; hsid: string; playerName: string }) {
  useEffect(() => {
    void ensureUploadForm(playerName);
    activate(window.location.hash);

    const onClick = (event: MouseEvent) => {
      const tab = (event.target as HTMLElement | null)?.closest?.('.pp-fz-tab') as HTMLAnchorElement | null;
      if (!tab) return;
      const hash = normalizeHash(tab.getAttribute('href'));
      event.preventDefault();
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
      void ensureUploadForm(playerName);
      activate(hash);
    };

    const onChange = (event: Event) => {
      const input = event.target as HTMLInputElement | null;
      if (!input || input.id !== 'goldenLinePhotoInput') return;
      const file = input.files?.[0];
      const preview = document.getElementById('goldenLinePreview');
      if (!preview || !file) return;
      preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Selected upload preview" />`;
    };

    const onSubmit = async (event: Event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form || form.id !== 'goldenLineUploadForm') return;
      event.preventDefault();
      const status = document.getElementById('goldenLineUploadStatus');
      const button = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      const formData = new FormData(form);
      const selectedPhoto = formData.get('photo');
      const dateTaken = String(formData.get('photoTakenDate') || '').trim();
      if (button) button.disabled = true;
      try {
        if (!dateTaken) throw new Error('Approximate date taken is required.');
        if (!(selectedPhoto instanceof File) || selectedPhoto.size === 0) throw new Error('Please choose a photo before submitting.');
        formData.set('playerId', playerId);
        formData.set('hsid', hsid);
        formData.set('playerName', playerName || '');
        formData.set('pageUrl', window.location.href);
        if (status) status.textContent = 'Uploading memory...';
        const res = await fetch('/api/player-moments', { method: 'POST', body: formData });
        const data = await parseApiResponse(res);
        if (!res.ok) throw new Error(data?.error || 'Upload failed.');
        if (status) status.textContent = 'Uploaded. It is pending review.';
        form.reset();
        const preview = document.getElementById('goldenLinePreview');
        if (preview) preview.innerHTML = '<span>Selected photo preview</span>';
        window.dispatchEvent(new CustomEvent('yat:golden-line-uploaded', { detail: data?.moment }));
      } catch (error: any) {
        if (status) status.textContent = error?.message || 'Upload failed.';
      } finally {
        if (button) button.disabled = false;
      }
    };

    const onHash = () => { void ensureUploadForm(playerName); activate(window.location.hash); };
    document.addEventListener('click', onClick, true);
    document.addEventListener('change', onChange);
    document.addEventListener('submit', onSubmit);
    window.addEventListener('hashchange', onHash);
    const observer = new MutationObserver(onHash);
    const zone = document.getElementById('playerFunZone');
    if (zone) observer.observe(zone, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('change', onChange);
      document.removeEventListener('submit', onSubmit);
      window.removeEventListener('hashchange', onHash);
      observer.disconnect();
    };
  }, [playerId, hsid, playerName]);

  return <style jsx global>{`
    .pp-funzone-outer, #playerFunZone { background:#070707 !important; }
    #playerFunZone { --profile-tabs-h:88px; position:relative !important; height:auto !important; min-height:0 !important; overflow:visible !important; display:block !important; padding-bottom:0 !important; }
    #playerFunZone > .pp-fz-panel { position:static !important; inset:auto !important; display:none !important; visibility:hidden !important; overflow:visible !important; overscroll-behavior:auto !important; background:radial-gradient(circle at 50% 0%, rgba(255,255,255,.045), transparent 38%), #070707 !important; color:#f4f4f4 !important; padding:10px 10px 12px !important; }
    #playerFunZone > .pp-fz-panel.pp-fz-panel-active { display:block !important; visibility:visible !important; }
    #playerFunZone > .pp-fz-panel[hidden] { display:none !important; }
    #playerFunZone .pp-fz-tabs-shell { position:sticky !important; left:0 !important; right:0 !important; bottom:var(--footerH,76px) !important; height:var(--profile-tabs-h) !important; z-index:40 !important; background:rgba(7,7,7,.96) !important; border-top:1px solid rgba(255,255,255,.12) !important; box-shadow:0 -10px 26px rgba(0,0,0,.58) !important; }
    #playerFunZone .pp-fz-tabs { height:100% !important; display:grid !important; grid-template-columns:repeat(6,minmax(0,1fr)) !important; max-width:640px !important; margin:0 auto !important; padding:0 8px !important; }
    #playerFunZone .pp-fz-tab { position:relative !important; display:flex !important; flex-direction:column !important; align-items:center !important; justify-content:center !important; gap:6px !important; color:rgba(255,255,255,.72) !important; text-decoration:none !important; min-width:0 !important; }
    #playerFunZone .pp-fz-tab::before, #playerFunZone .pp-fz-tab::after, #playerFunZone .pp-fz-tab-default::before, #playerFunZone .pp-fz-tab-default::after { display:none !important; opacity:0 !important; }
    #playerFunZone .pp-fz-tab.pp-fz-tab-active { color:#fff !important; }
    #playerFunZone .pp-fz-tab.pp-fz-tab-active::before { content:'' !important; display:block !important; opacity:1 !important; position:absolute !important; left:12% !important; right:12% !important; top:0 !important; height:3px !important; background:#d2b45c !important; }
    #playerFunZone .pp-fz-tab i { font-size:28px !important; line-height:1 !important; }
    #playerFunZone .pp-fz-tab span { font:900 12px/1 Oswald,sans-serif !important; letter-spacing:.08em !important; text-transform:uppercase !important; overflow:hidden !important; text-overflow:ellipsis !important; white-space:nowrap !important; max-width:100% !important; }
    .profile-upload-panel { width:min(980px,100%); margin:0 auto; padding:24px 18px 112px; display:grid; grid-template-columns:minmax(220px,30%) minmax(0,1fr); gap:20px; }
    .profile-upload-copy { border-left:5px solid #d2b45c; padding-left:18px; }
    .profile-upload-kicker { color:#d2b45c; font:900 12px/1 Oswald,sans-serif; letter-spacing:.18em; text-transform:uppercase; }
    .profile-upload-copy h2 { margin:10px 0 12px; color:#fff; font:900 clamp(30px,4vw,48px)/.9 Oswald,sans-serif; letter-spacing:.02em; text-transform:uppercase; }
    .profile-upload-copy p, .profile-upload-actions span { color:rgba(255,255,255,.72); font:400 15px/1.42 system-ui,sans-serif; }
    .profile-upload-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; padding:14px; border:1px solid rgba(210,180,92,.34); background:rgba(255,255,255,.04); }
    .profile-upload-form label { display:grid; gap:5px; color:rgba(255,255,255,.72); font:900 10px/1 Oswald,sans-serif; letter-spacing:.13em; text-transform:uppercase; }
    .profile-upload-form input, .profile-upload-form select, .profile-upload-form textarea { width:100%; border:1px solid rgba(255,255,255,.2); background:#090909; color:#fff; padding:9px; font:500 13px/1.25 system-ui,sans-serif; }
    .profile-upload-wide, .profile-upload-actions, .profile-upload-privacy, .profile-upload-identity { grid-column:1/-1; }
    .profile-upload-identity, .profile-upload-actions, .profile-upload-gate-actions, .profile-upload-privacy label { display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
    .profile-upload-identity, .profile-upload-privacy { padding:10px; border:1px solid rgba(255,255,255,.16); background:rgba(0,0,0,.38); }
    .profile-upload-preview { width:100%; aspect-ratio:7/5; border:1px solid rgba(210,180,92,.45); background:#111; display:grid; place-items:center; overflow:hidden; color:rgba(255,255,255,.45); font:900 10px/1 Oswald,sans-serif; letter-spacing:.12em; text-transform:uppercase; }
    .profile-upload-preview img { width:100%; height:100%; object-fit:cover; display:block; }
    .profile-upload-actions button, .profile-upload-gate-actions a { min-height:38px; padding:0 16px; border:1px solid rgba(210,180,92,.85); background:rgba(210,180,92,.12); color:#d2b45c; text-decoration:none; font:900 12px/1 Oswald,sans-serif; letter-spacing:.1em; text-transform:uppercase; }
    @media (max-width:760px) {
      #playerFunZone { --profile-tabs-h:82px; height:auto !important; min-height:0 !important; overflow:visible !important; }
      #playerFunZone > .pp-fz-panel { position:static !important; inset:auto !important; overflow:visible !important; padding:8px 6px 12px !important; }
      #playerFunZone .pp-fz-tabs-shell { position:sticky !important; bottom:var(--footerH,64px) !important; height:var(--profile-tabs-h) !important; z-index:10010 !important; overflow:hidden !important; }
      #playerFunZone .pp-fz-tabs { height:var(--profile-tabs-h) !important; max-width:520px !important; padding:0 6px !important; }
      #playerFunZone .pp-fz-tab { height:var(--profile-tabs-h) !important; padding:7px 1px 6px !important; gap:4px !important; }
      #playerFunZone .pp-fz-tab i { font-size:clamp(20px,5.4vw,26px) !important; }
      #playerFunZone .pp-fz-tab span { font-size:clamp(8px,2.35vw,11px) !important; letter-spacing:.06em !important; }
      .profile-upload-panel { grid-template-columns:1fr; padding:20px 14px 126px; }
      .profile-upload-form { grid-template-columns:1fr; }
    }
  `}</style>;
}
