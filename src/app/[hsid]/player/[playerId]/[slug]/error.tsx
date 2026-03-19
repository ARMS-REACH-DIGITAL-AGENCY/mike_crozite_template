'use client';

export default function PlayerProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh',textAlign:'center',fontFamily:'Oswald,system-ui,sans-serif'}}>
      <div>
        <div style={{font:'400 32px "Bebas Neue",sans-serif',letterSpacing:'.08em',marginBottom:'16px'}}>YAT?STATS</div>
        <div style={{font:'700 56px "Bebas Neue",sans-serif',letterSpacing:'.04em',color:'#333',lineHeight:1}}>Oops</div>
        <div style={{font:'300 15px/1.6 Oswald,sans-serif',color:'#888',margin:'16px 0 28px'}}>
          Unable to load this player profile right now.<br />
          Try refreshing, or go back to the school page.
          {error?.digest && (
            <><br /><small style={{opacity:.4,fontSize:'11px'}}>ref: {error.digest}</small></>
          )}
        </div>
        <div style={{display:'flex',gap:'10px',justifyContent:'center',flexWrap:'wrap'}}>
          <button
            onClick={() => reset()}
            style={{font:'700 12px Oswald,sans-serif',letterSpacing:'.12em',textTransform:'uppercase',padding:'10px 24px',border:'1px solid rgba(128,128,128,.4)',color:'inherit',background:'none',cursor:'pointer'}}
          >
            Try Again
          </button>
          <button
            onClick={() => window.history.back()}
            style={{font:'700 12px Oswald,sans-serif',letterSpacing:'.12em',textTransform:'uppercase',padding:'10px 24px',border:'1px solid rgba(128,128,128,.4)',color:'inherit',background:'none',cursor:'pointer'}}
          >
            Go Back
          </button>
          <a
            href="https://yatstats.com"
            style={{font:'700 12px Oswald,sans-serif',letterSpacing:'.12em',textTransform:'uppercase',padding:'10px 24px',border:'1px solid rgba(128,128,128,.4)',color:'inherit',textDecoration:'none',display:'inline-block'}}
          >
            Back to YAT?STATS
          </a>
        </div>
      </div>
    </div>
  );
}
