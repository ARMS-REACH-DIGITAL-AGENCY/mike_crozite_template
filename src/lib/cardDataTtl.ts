// Pete, Nov 18 2026: the gallery card front, the card back and the player
// profile all show flip_card_front_stage, so their kept copies follow ONE rule:
// the same age everywhere, and every copy of a card is thrown away together
// within about a minute of the card changing (src/app/api/cron/card-cache-sync).
// The age only matters if that clearing ever fails.
export const CARD_DATA_TTL_SECONDS = 3600;
