// Shared authoring limit and prompt order for retired-alumni memories.
// A flip-card memory must fit completely in the 5x7 card's lower section.
export const WHERE_YAT_MEMORY_MAX_CHARS = 400;
export const WHERE_YAT_PROMPTS = [
  {key:'favoriteHs',label:'MOST MEMORABLE MOMENT PLAYING AT YOUR HIGH SCHOOL'},
  {key:'favoriteAfter',label:'MOST MEMORABLE BASEBALL MOMENT AFTER GRADUATION'},
  {key:'family',label:'DO YOU HAVE A FAMILY? ANY BALLPLAYERS? TELL US MORE.'},
  {key:'story',label:'WHAT HAS LIFE BEEN LIKE SINCE BASEBALL?'},
] as const;
export type WhereYatPromptKey = (typeof WHERE_YAT_PROMPTS)[number]['key'];
