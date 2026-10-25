// Data-only school presentation preferences. Reusable splash reads this
// optional approved roster; other schools keep their existing selection.
// Player IDs are canonical flip_card_front_stage identifiers.
export const APPROVED_SPLASH_PLAYER_IDS_BY_HSID: Readonly<Record<string, readonly string[]>> = {
  '5004': [
    '320111',   // Cooper Brass
    '317316',   // Roch Cholowsky
    '180827',   // Cody Bellinger
    '213884',   // Drew Swift
    '225132',   // Dom Hamel
    '233197',   // Brock Selvidge
    '284749',   // Gavin Turley
    'YAT000067',// Ben Ball
  ],
};
