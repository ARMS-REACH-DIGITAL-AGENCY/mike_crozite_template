export default function ProfileFunZoneCleanupStyles() {
  return (
    <style jsx global>{`
      /* Profile FUNZONE cleanup layer: preserve the working fixed bottom tab bar,
         but remove the stale default Stats indicator and normalize tab sizing. */

      #playerFunZone .pp-fz-tab-default:not(.pp-fz-tab-active)::before,
      #playerFunZone .pp-fz-tab-default:not(.pp-fz-tab-active)::after {
        content: none !important;
        display: none !important;
        opacity: 0 !important;
      }

      #playerFunZone .pp-fz-tabs {
        align-items: center !important;
        justify-items: center !important;
        place-items: center !important;
      }

      #playerFunZone .pp-fz-tab {
        width: 100% !important;
        min-width: 0 !important;
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;
        gap: 4px !important;
      }

      #playerFunZone .pp-fz-tab i {
        font-size: 20px !important;
        line-height: 1 !important;
      }

      #playerFunZone .pp-fz-tab span {
        font-size: 10px !important;
        line-height: 1 !important;
      }

      #playerFunZone .pp-fz-tab.pp-fz-tab-active::before {
        display: block !important;
        opacity: 1 !important;
      }

      /* Option A: remove the player metadata ribbon from inside Block 5.
         It will be rehomed into Block 4 in the next, separate patch. */
      body #playerFunZone #ppTab-stats .psi-player-info {
        display: none !important;
      }

      @media (max-width: 760px) {
        #playerFunZone .pp-fz-tab i {
          font-size: 20px !important;
        }

        #playerFunZone .pp-fz-tab span {
          font-size: 10px !important;
        }
      }
    `}</style>
  );
}
