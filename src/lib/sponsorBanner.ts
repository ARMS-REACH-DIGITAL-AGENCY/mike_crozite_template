// src/lib/sponsorBanner.ts
// Shared constants and inline-script helper for the sticky footer sponsor banner.
//
// The banner image is served from S3 at SPONSOR_BANNER_IMG_URL.
// If the image is missing or fails to load, an inline JS error handler replaces it
// with the text fallback.  This runs in both the gallery page and player profile page.
//
// Image upload path on S3:
//   Bucket : yatstats-assets
//   Key    : sponsors/footer-banner.png
//   Recommended dimensions: 400 × 60 px at 2×  (800 × 120 px source)
//   Format : PNG (transparent background) or JPEG
//   Max file size: 200 KB

export const S3_BASE = "https://yatstats-assets.s3.us-west-2.amazonaws.com";

/** S3 path for the sticky footer sponsor banner image. */
export const SPONSOR_BANNER_IMG_URL = `${S3_BASE}/sponsors/footer-banner.png`;

/** Default sponsor link href. */
export const SPONSOR_FOOTER_HREF = "https://peteismyagent.com/products";

/** Default sponsor display name (text fallback). */
export const SPONSOR_FOOTER_NAME = "AMERICAN SOLUTIONS FOR BUSINESS";

/**
 * Inline script that gracefully replaces a missing/broken sponsor banner image
 * with the text fallback.  Inject via dangerouslySetInnerHTML immediately after
 * the footer element.
 *
 * Expects the footer anchor to have id="sponsorFooterLink" and the img to have
 * id="sponsorBannerImg".
 */
export const SPONSOR_BANNER_ERROR_SCRIPT = `
(function(){
  var img=document.getElementById('sponsorBannerImg');
  if(!img)return;
  img.onerror=function(){
    img.style.display='none';
    var a=document.getElementById('sponsorFooterLink');
    if(!a)return;
    var txt=document.createElement('span');
    txt.style.cssText='display:flex;flex-direction:column;align-items:center;gap:2px';
    var t1=document.createElement('span');t1.className='sponsor-text';t1.textContent='Presented by';
    var t2=document.createElement('span');t2.className='sponsor-name';t2.textContent='${SPONSOR_FOOTER_NAME}';
    txt.appendChild(t1);txt.appendChild(t2);a.appendChild(txt);
  };
})();
`.trim();
