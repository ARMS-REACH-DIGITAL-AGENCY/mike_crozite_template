'use client';

export default function ProfileFunZoneCleanupStyles() {
  return (
    <style jsx global>{`
      #playerFunZone #ppTab-stats .psi-player-info {
        display: none !important;
      }

      #playerFunZone .pp-fz-tab-default::before,
      #playerFunZone .pp-fz-tab-default::after,
      #playerFunZone .pp-fz-tab:not(.pp-fz-tab-active)::before,
      #playerFunZone .pp-fz-tab:not(.pp-fz-tab-active)::after {
        display: none !important;
        opacity: 0 !important;
      }

      #playerFunZone .pp-fz-tabs {
        display: grid !important;
        grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
        align-items: center !important;
        justify-items: center !important;
      }

      #playerFunZone .pp-fz-tab {
        width: 100% !important;
        min-width: 0 !important;
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;
        gap: 3px !important;
      }

      #playerFunZone .pp-fz-tab i {
        font-size: 19px !important;
        line-height: 1 !important;
      }

      #playerFunZone .pp-fz-tab span {
        font-size: 10px !important;
        line-height: 1 !important;
      }
    `}</style>
  );
}
