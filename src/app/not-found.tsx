// Pete (Nov 2026): any address that doesn't match a page (a misspelled or
// outdated school address, a bad link) sends the visitor to yatstats.com
// instead of showing a 404. The meta refresh and script do the redirect;
// the link is a fallback if both are blocked.
export default function NotFound() {
  return (
    <html lang="en">
      <head>
        <title>YAT?STATS</title>
        <meta name="robots" content="noindex" />
        <meta httpEquiv="refresh" content="0;url=https://yatstats.com" />
        <script
          dangerouslySetInnerHTML={{ __html: "window.location.replace('https://yatstats.com');" }}
        />
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@300;400&display=swap" rel="stylesheet" />
        <style>{`
          body{margin:0;background:#0a0a0a;color:#fff;font-family:Oswald,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
          .logo{font:400 32px "Bebas Neue",sans-serif;letter-spacing:.08em;margin-bottom:24px}
          .btn{display:inline-block;font:700 13px Oswald,sans-serif;letter-spacing:.12em;text-transform:uppercase;padding:10px 28px;border:1px solid rgba(255,255,255,.2);color:#fff;text-decoration:none}
        `}</style>
      </head>
      <body>
        <div>
          <div className="logo">YAT?STATS</div>
          <a href="https://yatstats.com" className="btn">Go to YAT?STATS</a>
        </div>
      </body>
    </html>
  );
}
