export default function CareerTimelineCtaOverrides() {
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      .zt-img-card .zt-prompt-card,
      .zt-prompt-card {
        position: relative !important;
        isolation: isolate !important;
        overflow: hidden !important;
        display: grid !important;
        width: 100% !important;
        height: 100% !important;
        min-width: 100% !important;
        align-content: center !important;
        justify-items: center !important;
        padding: 8px !important;
        box-sizing: border-box !important;
        background-image:
          linear-gradient(90deg, rgba(0,0,0,.58), rgba(0,0,0,.28) 52%, rgba(0,0,0,.08)),
          url('/img/career-path-default.jpg') !important;
        background-size: cover !important;
        background-position: center center !important;
        background-repeat: no-repeat !important;
      }

      .zt-img-card .zt-prompt-card b,
      .zt-img-card .zt-prompt-card strong,
      .zt-img-card .zt-prompt-card i,
      .zt-prompt-card b,
      .zt-prompt-card strong,
      .zt-prompt-card i {
        display: none !important;
      }

      .zt-img-card .zt-prompt-card::before,
      .zt-prompt-card::before {
        content: 'The baseball journey doesn\'t end at graduation.\\A Neither should the story.';
        white-space: pre-line;
        position: relative;
        z-index: 2;
        display: block;
        max-width: 78%;
        margin-left: auto;
        color: #fff8df;
        font: 900 10px/1.05 Oswald, Impact, sans-serif;
        letter-spacing: .035em;
        text-align: center;
        text-transform: none;
        text-shadow: 0 2px 4px rgba(0,0,0,.86), 0 0 1px rgba(0,0,0,.9);
      }

      @media (min-width: 760px) {
        .zt-img-card .zt-prompt-card::before,
        .zt-prompt-card::before {
          font-size: 12px;
        }
      }
    ` }} />
  );
}
