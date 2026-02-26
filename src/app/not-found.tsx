export default function NotFound() {
  return (
    <html lang="en">
      <head>
        <title>Not Found | YAT?STATS</title>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@300;400&display=swap" rel="stylesheet" />
        <style>{`
          body{margin:0;background:#0a0a0a;color:#fff;font-family:Oswald,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
          .logo{font:400 32px "Bebas Neue",sans-serif;letter-spacing:.08em;margin-bottom:24px}
          .code{font:700 96px "Bebas Neue",sans-serif;letter-spacing:.04em;color:#222;line-height:1}
          .msg{font:300 16px/1.6 Oswald,sans-serif;color:#888;margin:16px 0 32px}
          .btn{display:inline-block;font:700 13px Oswald,sans-serif;letter-spacing:.12em;text-transform:uppercase;padding:10px 28px;border:1px solid rgba(255,255,255,.2);color:#fff;text-decoration:none;transition:border-color .2s}
          .btn:hover{border-color:#fff}
        `}</style>
      </head>
      <body>
        <div>
          <div className="logo">YAT?STATS</div>
          <div className="code">404</div>
          <div className="msg">This school microsite doesn&apos;t exist yet.<br />Check back soon — we&apos;re adding 1,024 programs.</div>
          <a href="https://yatstats.com" className="btn">Back to YAT?STATS</a>
        </div>
      </body>
    </html>
  );
}
