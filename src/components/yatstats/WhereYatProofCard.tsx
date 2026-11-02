'use client';

import PlayerCardBackHero from './PlayerCardBackHero';
import type { Crop } from '@/lib/contribute';
import type { CSSProperties } from 'react';
import { WHERE_YAT_MEMORY_MAX_CHARS } from '@/lib/whereYatPrompts';
import { toSlugFromDisplay } from '@/lib/slug';
import { normalizeWhereYatLink, type WhereYatLinkField } from '@/lib/whereYatLinks';

// The same content is used in the contributor proof, the real flip-card tab,
// and the authenticated saved proof. Only the full proof adds the existing
// player hero and a visual replica of the existing six-tab footer.
export type WhereYatProof = {
  displayName: string;
  playerId?: string;
  hsid?: string;
  position?: string;
  city?: string;
  state?: string;
  occupation?: string;
  company?: string;
  website?: string;
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  x?: string;
  story?: string;
  storyPrompt?:string;
  photoUrl?: string | null;
  logoUrl?: string | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
  businessPublic?: boolean;
  businesses?: Array<{name:string;website:string;logoUrl?:string}>;
  businessHeadshotUrl?:string|null;
  /** Unpublished image selected in the single retired-card drawer. */
  heroPreviewUrl?: string | null;
  heroCrop?: Crop | null;
  businessHeadshotCrop?: Crop | null;
  memoryPhotoCrop?: Crop | null;
};

type Social = { key: WhereYatLinkField; icon: string; label: string; className: string };
const socialItems: Social[] = [
  { key: 'facebook', icon: 'ri-facebook-fill', label: 'Facebook', className: 'wyn-facebook' },
  { key: 'instagram', icon: 'ri-instagram-line', label: 'Instagram', className: 'wyn-instagram' },
  { key: 'x', icon: 'ri-twitter-x-line', label: 'X', className: 'wyn-x' },
  { key: 'linkedin', icon: 'ri-linkedin-fill', label: 'LinkedIn', className: 'wyn-linkedin' },
];
const footerTabs = [
  ['ri-calendar-line', 'YAT?'],
  ['ri-bar-chart-2-line', 'STATS'],
  ['ri-newspaper-line', 'NEWS'],
  ['ri-share-line', 'SOCIAL'],
  ['ri-group-line', 'CONNECT'],
  ['ri-upload-cloud-line', 'STORIES'],
] as const;

const css = "\n  .wyn-card {box-sizing:border-box;position:relative;container-type:inline-size;aspect-ratio:5 / 7;width:100%;max-width:100%;overflow:hidden;background-color:#cfc6b8;background-image:repeating-linear-gradient(0deg,transparent 0,transparent 19px,rgba(75,55,35,.055) 20px),repeating-linear-gradient(90deg,transparent 0,transparent 19px,rgba(75,55,35,.045) 20px);}\n  .wyn-card-frame {height:calc(100% - 2.2cqi);margin:1.1cqi;display:flex;flex-direction:column;border:clamp(1px,.6cqi,3px) solid rgba(34,27,19,.72);border-radius:3px;overflow:hidden;min-height:0;background-color:#e6e7da;}\n  .wyn-card .yat-back-hero{display:block;position:relative;flex:none;height:36cqi;max-height:31%;width:100%;overflow:hidden;text-decoration:none;background:#35312c;}\n  .wyn-card .yat-back-img{position:absolute;inset:0;height:100%;width:100%;object-fit:cover;object-position:top center;display:block;}\n  .wyn-card .yat-back-hero-fallback{position:absolute;inset:0;background:#534c45;z-index:-1;}\n  .wyn-card .yat-back-scrim{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(0,0,0,.78),rgba(0,0,0,.3) 55%,transparent 85%);}\n  .wyn-card .yat-back-meta{position:absolute;top:0;left:0;z-index:3;padding:clamp(6px,2.1cqi,13px);}\n  .wyn-card .ybm-name{font:800 clamp(16px,5.4cqi,31px)/1 'Bebas Neue',Oswald,sans-serif;color:white;text-transform:uppercase;letter-spacing:.045em;text-shadow:0 1px 4px #000;}\n  .wyn-card .ybm-pos{font:600 clamp(8px,2.8cqi,15px)/1.4 Oswald,sans-serif;color:white;letter-spacing:.06em;}\n  .wyn-card .ybm-team,.wyn-card .ybm-org,.wyn-card .ybm-bthw{display:none;}\n  .wyn-body{box-sizing:border-box;container-type:inline-size;display:flex;flex-direction:column;flex:1;width:100%;height:100%;min-height:0;min-width:0;overflow:hidden;color:#33332e;font-family:Archivo,Arial,sans-serif;background-color:#e6e7da;background-image:repeating-linear-gradient(0deg,transparent 0,transparent 19px,rgba(70,70,55,.03) 20px),repeating-linear-gradient(90deg,transparent 0,transparent 19px,rgba(70,70,55,.025) 20px);}\n  .wyn-top-half{box-sizing:border-box;position:relative;flex:none;min-height:44.6cqi;min-width:0;padding-top:2.4cqi;}\n  .wyn-heading{position:relative;z-index:1;margin-left:3.9cqi;color:#fff;font:700 4.5cqi/1.1 Oswald,'Arial Narrow',sans-serif;-webkit-text-stroke:.16cqi #17130f;text-shadow:.28cqi .32cqi 0 #17130f,0 0 .2cqi #17130f;white-space:nowrap;}\n  .wyn-info-panel{box-sizing:border-box;position:relative;z-index:1;width:60.2cqi;min-height:20.6cqi;margin:2.3cqi 0 0 5.1cqi;padding:1.9cqi 1.9cqi 1.5cqi 2.1cqi;border-radius:.9cqi;background:rgba(120,120,105,.27);}\n  .wyn-business-names{color:#55554f;font:700 2.75cqi/3.55cqi Archivo,Arial,sans-serif;overflow-wrap:anywhere;}\n  .wyn-business-names div{display:block;}\n  .wyn-names-long .wyn-business-names{font-size:2.25cqi;line-height:2.9cqi;}\n  .wyn-small-name{font:700 2.75cqi/3.55cqi Oswald,sans-serif;margin:0;text-align:right;}\n  .wyn-identity-details{margin-top:.7cqi;text-align:right;}\n  .wyn-identity-details p{color:#67675f;font:400 2.35cqi/2.9cqi Archivo,Arial,sans-serif;margin:0;overflow-wrap:anywhere;}\n  .wyn-identity-details p.wyn-occupation{color:#55554f;font:600 3cqi/3.4cqi Archivo,Arial,sans-serif;}\n  .wyn-headshot{display:block;overflow:hidden;position:absolute;right:0;top:1.6cqi;width:30.4cqi;height:41.3cqi;z-index:0;pointer-events:none;}\n  .wyn-headshot img{object-position:center top;}\n  .wyn-business-links{box-sizing:border-box;position:relative;z-index:2;display:grid;grid-template-columns:repeat(var(--wyn-business-link-count,1),6.7cqi);align-items:center;justify-content:start;gap:2.4cqi;margin:3.1cqi 0 0 5.2cqi;}\n  .wyn-business-list{display:contents;}\n  .wyn-business-list a,.wyn-business-list span{display:flex;align-items:center;justify-content:center;min-width:0;text-decoration:none;}\n  .wyn-business-list img,.wyn-business-logo{display:block;object-fit:contain;width:6.7cqi;height:6.7cqi;}\n  .wyn-business-logo-link{display:flex;}\n  .wyn-socials{display:contents;}\n  .wyn-social{display:grid;place-items:center;width:6.7cqi;height:6.7cqi;border-radius:50%;text-decoration:none!important;color:#fff!important;background:#333;font-size:3.9cqi;box-shadow:0 .1cqi .35cqi #0005;}\n  .wyn-social i{line-height:1;}\n  .wyn-website{background:#356b40}.wyn-facebook{background:#2563eb}.wyn-instagram{background:linear-gradient(30deg,#f9ce34,#ee2a7b,#6228d7)}.wyn-x{background:#070707}.wyn-linkedin{background:#1d5fa8}.wyn-contact{background:#2a6fb8}.wyn-text{background:#1c4f96;}\n  .wyn-bottom-half{box-sizing:border-box;flex:1 1 auto;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden;padding:2.1cqi 4.5cqi 0 4.3cqi;}\n  .wyn-story-prompt{flex:none;color:#fff;font:700 3.75cqi/1.1 Oswald,'Arial Narrow',sans-serif;-webkit-text-stroke:.14cqi #17130f;text-shadow:.24cqi .28cqi 0 #17130f,0 0 .2cqi #17130f;letter-spacing:.015em;text-transform:uppercase;}\n  .wyn-memory-content{flex:1;min-height:0;overflow:hidden;margin-top:1.4cqi;}\n  .wyn-memory-inner{display:flow-root;width:100%;min-width:0;}\n  .wyn-featured-photo{display:block;float:left;width:auto;height:auto;max-width:29cqi;max-height:19.5cqi;margin:.2cqi 1.6cqi 1.1cqi .4cqi;}\n  .wyn-featured-crop{display:block;float:left;position:relative;overflow:hidden;width:19.5cqi;height:19.5cqi;margin:.2cqi 1.6cqi 1.1cqi .4cqi;}\n  .wyn-story{display:block;margin:0;color:#33332e;font:400 3.05cqi/3.95cqi Archivo,Arial,sans-serif;white-space:normal;overflow-wrap:break-word;}\n  .wyn-story-m{font-size:2.7cqi;line-height:3.5cqi;}\n  .wyn-story-s{font-size:2.3cqi;line-height:3cqi;}\n  .wyn-proof-cta{box-sizing:border-box;display:flex;flex:none;align-items:center;justify-content:space-between;min-width:0;gap:1cqi;width:93.4cqi;margin:1cqi auto 2cqi;padding:0 2.6cqi 0 2.8cqi;min-height:8.4cqi;border:.3cqi solid #7c5300;border-radius:1.6cqi;background:linear-gradient(180deg,#ffe97a 0%,#f8cf2e 48%,#dca40c 100%);box-shadow:0 .25cqi .45cqi #3b2a0880,inset 0 .15cqi 0 #fff6b8;color:#17100a!important;text-align:left;text-decoration:none!important;font:700 3.4cqi/1.05 Oswald,'Arial Narrow',sans-serif;letter-spacing:.012em;text-transform:uppercase;}\n  .wyn-proof-cta i{font-size:1.5em;flex:none;}\n  .wyn-footer{flex:none;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));min-height:11cqi;border-top:clamp(1px,.5cqi,3px) solid rgba(30,22,14,.35);background:rgba(30,22,14,.06);}\n  .wyn-footer-tab{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;padding:clamp(1px,.5cqi,4px) 0;gap:clamp(1px,.4cqi,3px);border-right:1px solid rgba(30,22,14,.1);color:#51483f;text-align:center;}\n  .wyn-footer-tab:first-child{color:#14110d;border-top:clamp(1px,.5cqi,3px) solid #14110d;}\n  .wyn-footer-tab i{font-size:clamp(10px,4cqi,21px);line-height:1;}\n  .wyn-footer-tab span{font:700 clamp(6px,1.9cqi,10px)/1 Oswald,'Arial Narrow',sans-serif;white-space:nowrap;text-transform:uppercase;}\n  .wyn-embedded{box-sizing:border-box;display:flex;flex-direction:column;flex:1;width:100%;height:100%;max-width:100%;min-height:0;overflow:hidden;background:transparent;padding:0;}\n";


/** One-line text that shrinks only when it is longer than the card allows
 *  (long first names in the button, the longest memory heading). */
export const fitCqi=(text:string,base:number,fits:number)=>({fontSize:Math.min(base,base*fits/Math.max(1,text.length)).toFixed(2)+'cqi'});
export const whereYatCtaText=(displayName:string)=>'READ MORE ABOUT '+displayName.trim().split(/\s+/)[0].toUpperCase()+'’S LIFE AFTER HIGH SCHOOL';

export default function WhereYatProofCard({
  proof, showName = false, variant = 'content',
}: { proof: WhereYatProof; showName?: boolean; variant?: 'full' | 'content' }) {
  const location = [proof.city, proof.state].filter(Boolean).join(', ');
  const profileHref = proof.playerId && proof.hsid
    ? `/${proof.hsid}/player/${proof.playerId}/${toSlugFromDisplay(proof.displayName)}`
    : '#sec-alltime';
  const businessHref = normalizeWhereYatLink('website', proof.website || '').url;
  const links = socialItems.map(item => {
    const raw = proof[item.key] || '';
    const normalized = normalizeWhereYatLink(item.key, raw);
    return normalized.url ? { ...item, href: normalized.url } : null;
  }).filter((item): item is Social & { href: string } => !!item);

  const showBusiness = proof.businessPublic !== false;
  const businesses=(proof.businesses||[]).slice(0,1).filter(item=>item.name||item.website||item.logoUrl);
  const socialLinks=links.slice().sort((a,b)=>['linkedin','facebook','x','instagram'].indexOf(a.key)-['linkedin','facebook','x','instagram'].indexOf(b.key));
  const publicEmail=showBusiness && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(proof.businessEmail||'') ? String(proof.businessEmail).trim() : '';
  const publicPhone=showBusiness ? String(proof.businessPhone||'').replace(/[^0-9+]/g,'') : '';
  const emailHref=publicEmail?'mailto:'+publicEmail:'';
  const textHref=publicPhone.replace(/\D/g,'').length>=10?'sms:'+publicPhone:'';
  // Each business sits on its own line, whichever way the alum separated them.
  const businessNames=(businesses.map(item=>item.name).filter(Boolean).join(' | ')||proof.company||'').split(/\s*\|\s*/).map(name=>name.trim()).filter(Boolean);
  const longNames=businessNames.length>3||businessNames.some(name=>name.length>42);
  const businessLogos=businesses.filter(item=>item.logoUrl);
  // One grid track per actual link, including the company website logo.
  // Keeping the count dynamic distributes 1-7 controls evenly, even when
  // an alumnus has only some of the social/contact options configured.
  const businessLinkCount=(businessLogos.length>0||proof.logoUrl?1:0)
    +socialLinks.length+(emailHref?1:0)+(textHref?1:0);
  const storyPrompt=proof.storyPrompt||'WHAT HAS LIFE BEEN LIKE SINCE BASEBALL?';
  const storyText=proof.story||'Visit the player profile to learn more about life after baseball.';
  // Every new answer is limited to WHERE_YAT_MEMORY_MAX_CHARS and prints at full size.
  // Only older answers saved before the limit step down so they are never cut off.
  const storySize=storyText.length>WHERE_YAT_MEMORY_MAX_CHARS+90?' wyn-story-s':storyText.length>WHERE_YAT_MEMORY_MAX_CHARS?' wyn-story-m':'';
  const portrait=showBusiness ? proof.businessHeadshotUrl : null;
  const heroCrop=proof.heroPreviewUrl ? proof.heroCrop : null;
  const headshotCrop=proof.businessHeadshotUrl&&proof.businessHeadshotCrop;
  const memoryCrop=proof.photoUrl&&proof.memoryPhotoCrop;
  const heroStyle=heroCrop ? {
    '--wyn-hero-left': (-heroCrop.x / Math.max(0.001,heroCrop.w) * 100) + '%',
    '--wyn-hero-top': (-heroCrop.y / Math.max(0.001,heroCrop.h) * 100) + '%',
    '--wyn-hero-width': (100 / Math.max(0.001,heroCrop.w)) + '%',
    '--wyn-hero-height': (100 / Math.max(0.001,heroCrop.h)) + '%',
  } as CSSProperties : undefined;
  const showBusinessArea=showBusiness && (businessNames.length>0||proof.logoUrl||businessLogos.length>0||businessHref||socialLinks.length>0||emailHref||textHref);
  const body = (
    <div className="wyn-body">
      <div className="wyn-top-half">
        <div className="wyn-heading">WHERE YAT NOW?</div>
        {((showBusiness&&businessNames.length>0)||showName||proof.occupation||location)&&<div className={'wyn-info-panel'+(longNames?' wyn-names-long':'')}>
          {showBusiness&&businessNames.length>0&&<div className="wyn-business-names">{businessNames.map(name=><div key={name}>{name}</div>)}</div>}
          <div className="wyn-identity-details">
            {showName && <div className="wyn-small-name">{proof.displayName}</div>}
            {proof.occupation && <p className="wyn-occupation">{proof.occupation}</p>}
            {location && <p>{location}</p>}
          </div>
        </div>}
        {portrait && <span className="wyn-headshot" role="img" aria-label={proof.displayName+' business portrait'}><img src={portrait} alt="" style={headshotCrop?{position:'absolute',maxWidth:'none',left:(-100*headshotCrop.x/headshotCrop.w)+'%',top:(-100*headshotCrop.y/headshotCrop.h)+'%',width:(100/headshotCrop.w)+'%',height:(100/headshotCrop.h)+'%',objectFit:'fill'}:{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center top'}}/></span>}
        {showBusinessArea && <div className="wyn-business-links" style={{'--wyn-business-link-count':Math.max(1,businessLinkCount)} as CSSProperties} aria-label="Business logos and contact links">
          {(businessLogos.length>0||proof.logoUrl)&&<div className="wyn-business-list">
            {businessLogos.length>0 ? businessLogos.map((business,i)=>{
              const href=normalizeWhereYatLink('website',business.website||'').url;
              return href
                ? <a href={href} key={i} target="_blank" rel="noopener noreferrer" title={business.name||'Business website'}><img src={business.logoUrl} alt={(business.name||'Business')+' logo'}/></a>
                : <span key={i}><img src={business.logoUrl} alt={(business.name||'Business')+' logo'}/></span>;
            }) : proof.logoUrl && (businessHref
              ? <a className="wyn-business-logo-link" href={businessHref} target="_blank" rel="noopener noreferrer" aria-label="Visit business website"><img className="wyn-business-logo" src={proof.logoUrl} alt={(proof.company||'Business')+' logo'}/></a>
              : <span><img className="wyn-business-logo" src={proof.logoUrl} alt={(proof.company||'Business')+' logo'}/></span>)}
          </div>}
          <div className="wyn-socials" aria-label="Public business contact options">
            
            {socialLinks.map(link=><a key={link.key} className={'wyn-social '+link.className} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.label}><i className={link.icon} aria-hidden="true"/></a>)}
            {emailHref && <a className="wyn-social wyn-contact" href={emailHref} aria-label="Email business"><i className="ri-mail-line" aria-hidden="true"/></a>}
            {textHref && <a className="wyn-social wyn-text" href={textHref} aria-label="Text business"><i className="ri-message-3-fill" aria-hidden="true"/></a>}
          </div>
        </div>}
      </div>
      <div className="wyn-bottom-half">
        <div className="wyn-story-prompt" style={fitCqi(storyPrompt,3.75,43)}>{storyPrompt}</div>
        <div className="wyn-memory-content"><div className="wyn-memory-inner">
          {proof.photoUrl && (memoryCrop
            ? <span className="wyn-featured-crop"><img src={proof.photoUrl} alt="Photo accompanying the selected memory" style={{position:'absolute',maxWidth:'none',left:(-100*memoryCrop.x/memoryCrop.w)+'%',top:(-100*memoryCrop.y/memoryCrop.h)+'%',width:(100/memoryCrop.w)+'%',height:(100/memoryCrop.h)+'%'}}/></span>
            : <img className="wyn-featured-photo" src={proof.photoUrl} alt="Photo accompanying the selected memory"/>)}
          <p className={'wyn-story'+storySize}>{storyText}</p>
        </div></div>
      </div>
    </div>
  );

  if (variant === 'content') {
    return <div className="wyn-embedded">{body}<style>{css}</style></div>;
  }

  return (
    <div className={'wyn-card'+(heroCrop?' wyn-new-hero':'')} style={heroStyle} aria-label={'5 by 7 retired alumni card proof for ' + proof.displayName}>
      <div className="wyn-card-frame">
        {proof.playerId
          ? <PlayerCardBackHero playerId={proof.playerId} displayName={proof.displayName}
              profileHref={profileHref} teamName="" orgConf=""
              posLevelStatus={[proof.position, 'RETIRED'].filter(Boolean).join(' - ')} btHw="" previewImageUrl={proof.heroPreviewUrl||null} />
          : <div className="yat-back-hero"><div className="yat-back-meta"><div className="ybm-name">{proof.displayName}</div>
              <div className="ybm-pos">RETIRED</div></div></div>}
        {body}
        <a className="wyn-proof-cta" href={profileHref+'#ppTab-schedule'} aria-label={'Read more about '+proof.displayName+' after high school'} style={fitCqi(whereYatCtaText(proof.displayName),3.4,48)}>{whereYatCtaText(proof.displayName)}<i className="ri-arrow-right-s-line" aria-hidden="true"/></a>
        <div className="wyn-footer" aria-label="Visual preview of the flip-card tabs">
          {footerTabs.map(([icon,label]) => <div className="wyn-footer-tab" key={label}>
            <i className={icon} aria-hidden="true" /><span>{label}</span>
          </div>)}
        </div>
      </div>
      <style>{css}</style>
      <style>{`.wyn-card.wyn-new-hero .yat-back-hero .yat-back-img{left:var(--wyn-hero-left)!important;top:var(--wyn-hero-top)!important;width:var(--wyn-hero-width)!important;height:var(--wyn-hero-height)!important;max-width:none!important;max-height:none!important;object-fit:fill!important;}`}</style>
    </div>
  );
}
