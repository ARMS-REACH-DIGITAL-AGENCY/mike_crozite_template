// src/components/yatstats/profile/CareerFilmstrip.tsx
// Row 3 equivalent for the player profile: the career progression filmstrip.
// LEFT_ANCHOR → TIMELINE frames → RIGHT_ANCHOR

import SafeImage from '@/components/SafeImage';
import { PLAYER_SILHOUETTE_URL } from '@/lib/playerImage';

export type FilmSlot = {
  img: string;
  altSrc?: string;
  label: string;
  sub: string;
  role: 'anchor' | 'timeline';
};

interface CareerFilmstripProps {
  slots: FilmSlot[];
}

export default function CareerFilmstrip({ slots }: CareerFilmstripProps) {
  return (
    <section className="career-strip" id="playerHeroMeta">
      <div className="career-strip-inner">
        {slots.map((slot, idx) => (
          <div key={`${slot.role}-${idx}-${slot.img}`} className={`career-slot ${slot.role}`}>
            <SafeImage
              className="career-slot-img"
              src={slot.img}
              alt={slot.label}
              fallbackSrc={slot.altSrc || PLAYER_SILHOUETTE_URL}
              placeholderSrc={PLAYER_SILHOUETTE_URL}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
