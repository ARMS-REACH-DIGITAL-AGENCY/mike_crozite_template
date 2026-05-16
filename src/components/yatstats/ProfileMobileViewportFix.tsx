'use client';

export default function ProfileMobileViewportFix() {
  return (
    <style jsx global>{`
      @media (max-width: 760px) {
        html,
        body {
          width: 100% !important;
          max-width: 100% !important;
          overflow-x: hidden !important;
        }

        body,
        #__next,
        main,
        .yat-shell,
        .yat-page,
        .pp-funzone-outer,
        #playerFunZone {
          width: 100vw !important;
          max-width: 100vw !important;
          min-width: 0 !important;
          overflow-x: hidden !important;
          box-sizing: border-box !important;
        }

        #playerFunZone > .pp-fz-panel {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
        }

        #playerFunZone #ppTab-stats,
        #playerFunZone #ppTab-upload,
        #playerFunZone #ppTab-news,
        #playerFunZone #ppTab-schedule,
        #playerFunZone #ppTab-social,
        #playerFunZone #ppTab-connect {
          overflow-x: hidden !important;
        }

        #playerFunZone #ppTab-stats .psi-shell {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          overflow-x: hidden !important;
        }

        #playerFunZone #ppTab-stats .psi-card,
        #playerFunZone #ppTab-stats .psi-table-wrap,
        #playerFunZone .pp-season-table-wrap,
        #playerFunZone .pp-sched-section,
        #playerFunZone .pp-stats-section {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch !important;
          box-sizing: border-box !important;
        }

        #playerFunZone #ppTab-stats .psi-table,
        #playerFunZone .pp-season-table,
        #playerFunZone .pp-sched-table {
          width: max-content !important;
          min-width: 720px !important;
          max-width: none !important;
        }

        #playerFunZone #ppTab-upload .profile-upload-panel,
        #playerFunZone .profile-upload-panel {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          margin: 0 !important;
          padding: 14px 12px 58px !important;
          display: grid !important;
          grid-template-columns: 1fr !important;
          gap: 14px !important;
          box-sizing: border-box !important;
        }

        #playerFunZone .profile-upload-form {
          width: 100% !important;
          min-width: 0 !important;
          grid-template-columns: 1fr !important;
          box-sizing: border-box !important;
        }

        #playerFunZone .profile-upload-preview {
          width: 100% !important;
          min-width: 0 !important;
        }

        #playerFunZone .fz-featured-stream-profile,
        #playerFunZone .fz-featured-stream-card,
        #playerFunZone .fz-stream-frame-card {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
        }
      }
    `}</style>
  );
}
