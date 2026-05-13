'use client';

export default function ProfileFunZoneCleanupStyles() {
  return (
    <style jsx global>{`
      /* Emergency rollback: preserve the previously working FunZone behavior.
         Keep only the safe metadata-ribbon removal. */

      body #playerFunZone #ppTab-stats .psi-player-info {
        display: none !important;
      }
    `}</style>
  );
}
