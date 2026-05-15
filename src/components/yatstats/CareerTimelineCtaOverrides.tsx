export default function CareerTimelineCtaOverrides() {
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt {
        transform: translateX(calc(-50% + 82px)) !important;
        overflow: visible !important;
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
        background: transparent !important;
      }

      .zt-window-images .zt-canvas-images > .zt-upload-slot:first-child {
        transform: translate(calc(-50% + 82px), -50%) !important;
      }

      .zt-img-card:has(.zt-prompt-card),
      .zt-img-moment.zt-prompt .zt-img-card,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt .zt-img-card {
        border: 0 !important;
        border-color: transparent !important;
        box-shadow: none !important;
        padding: 0 !important;
        margin: 0 !important;
        background: transparent !important;
        overflow: hidden !important;
      }

      .zt-img-moment.zt-prompt .zt-img-card::before,
      .zt-img-moment.zt-prompt .zt-img-card::after {
        display: none !important;
        content: none !important;
      }

      .zt-img-card .zt-prompt-card,
      .zt-prompt-card {
        position: relative !important;
        isolation: isolate !important;
        overflow: hidden !important;
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        min-width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
        box-sizing: border-box !important;
        transform: none !important;
        background-color: transparent !important;
        background-image: url('/img/career-path-default.jpg') !important;
        background-size: 100% 100% !important;
        background-position: center center !important;
        background-repeat: no-repeat !important;
      }

      .zt-img-card .zt-prompt-card b,
      .zt-img-card .zt-prompt-card strong,
      .zt-img-card .zt-prompt-card i,
      .zt-prompt-card b,
      .zt-prompt-card strong,
      .zt-prompt-card i,
      .zt-img-card .zt-prompt-card::before,
      .zt-prompt-card::before,
      .zt-img-card .zt-prompt-card::after,
      .zt-prompt-card::after {
        display: none !important;
        content: none !important;
      }

      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt + .zt-img-moment,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt + .zt-img-moment .zt-img-card,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt + .zt-img-moment .zt-image-wrap,
      .zt-window-images .zt-canvas-images .zt-img-moment.zt-prompt + .zt-img-moment img {
        margin-left: 0 !important;
      }
    ` }} />
  );
}
