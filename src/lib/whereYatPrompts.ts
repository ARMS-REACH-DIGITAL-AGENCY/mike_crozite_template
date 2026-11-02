// Shared authoring limits and prompt order for retired-alumni flip cards.
// One layout serves every retired alum, so every answer that prints on the
// card has a hard limit that is known to fit the 5x7 card at full size,
// with a memory photo and all seven logo/contact icons. The drawer, the
// server and scripts/verify-where-yat-now.cjs all read these numbers.
export const WHERE_YAT_MEMORY_MAX_CHARS = 300;
export const WHERE_YAT_LIMITS = {
  /** Each business/organization line in the gray box. */
  businessLine: 34,
  /** Number of business lines in the gray box. */
  businessLines: 3,
  /** Profession / title: one line under the business names. */
  occupation: 32,
  city: 24,
  state: 14,
  memory: WHERE_YAT_MEMORY_MAX_CHARS,
} as const;
export const WHERE_YAT_PROMPTS = [
  {key:'favoriteHs',label:'MOST MEMORABLE MOMENT PLAYING AT YOUR HIGH SCHOOL'},
  {key:'favoriteAfter',label:'MOST MEMORABLE BASEBALL MOMENT AFTER GRADUATION'},
  {key:'family',label:'DO YOU HAVE A FAMILY? ANY BALLPLAYERS? TELL US MORE.'},
  {key:'story',label:'WHAT HAS LIFE BEEN LIKE SINCE BASEBALL?'},
] as const;
export type WhereYatPromptKey = (typeof WHERE_YAT_PROMPTS)[number]['key'];

/** The heading printed on the card above the featured memory. The drawer
 *  proof, the saved proof page and the published card all use this one map,
 *  so the proof the alum approves reads exactly like the published card. */
export const WHERE_YAT_CARD_HEADINGS: Record<WhereYatPromptKey, string> = {
  favoriteHs: 'MOST MEMORABLE HIGH SCHOOL BASEBALL MOMENT',
  favoriteAfter: 'MOST MEMORABLE BASEBALL MOMENT AFTER GRADUATION',
  family: 'LIFE AND FAMILY',
  story: 'WHAT HAS LIFE BEEN LIKE SINCE BASEBALL?',
};
export const whereYatCardHeading = (key?: string | null) =>
  WHERE_YAT_CARD_HEADINGS[(key || 'story') as WhereYatPromptKey] || WHERE_YAT_CARD_HEADINGS.story;

/** Business names as stored in company_name: "One | Two | Three". */
export const splitBusinessNames = (value: string) =>
  String(value || '').split(/\s*\|\s*/).map(name => name.trim()).filter(Boolean);

/** First problem with the printed answers, or '' when everything fits. */
export function whereYatLimitProblem(v: {
  company?: string; occupation?: string; city?: string; state?: string;
  memories?: Array<{ label: string; text: string }>;
}): string {
  const L = WHERE_YAT_LIMITS;
  const names = splitBusinessNames(v.company || '');
  if (names.length > L.businessLines) return `List up to ${L.businessLines} businesses.`;
  const long = names.find(name => name.length > L.businessLine);
  if (long) return `Keep each business name to ${L.businessLine} characters ("${long.slice(0, 24)}…").`;
  if ((v.occupation || '').trim().length > L.occupation) return `Keep your profession to ${L.occupation} characters.`;
  if ((v.city || '').trim().length > L.city) return `Keep the city to ${L.city} characters.`;
  if ((v.state || '').trim().length > L.state) return `Keep the state to ${L.state} characters.`;
  const memory = (v.memories || []).find(m => m.text.trim().length > L.memory);
  if (memory) return `Keep each memory to ${L.memory} characters so it fits the card (${memory.label.toLowerCase()}).`;
  return '';
}
