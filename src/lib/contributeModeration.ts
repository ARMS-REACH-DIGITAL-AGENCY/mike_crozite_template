// src/lib/contributeModeration.ts
// Automatic review of a fan's photo, the moment it's sent: Claude looks at
// the staged (cropped) photo with what the fan said it is, and decides.
//   approve -> it goes on the site right away (promoteUpload)
//   reject  -> it doesn't, and the fan is told why
//   review  -> Claude isn't sure; it waits in /contribute-review for a person
// Without ANTHROPIC_API_KEY nothing is decided automatically: every photo
// waits for a person, the same as 'review'.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { photoTypeLabel, type PhotoPurpose } from './contribute';

const Verdict = z.object({
  decision: z.enum(['approve', 'reject', 'review']),
  // Safe for a family audience: no nudity, violence, hate, drugs, gestures.
  appropriate: z.boolean(),
  // The kind of photo the fan said it is (see the purpose description).
  matches_type: z.boolean(),
  // A photographer's or stock watermark, a logo stamped over the image.
  watermark: z.boolean(),
  // Sharp enough, lit well enough and big enough to use.
  quality_ok: z.boolean(),
  // Shown to the fan when the photo is rejected - one short, friendly sentence.
  reason_for_fan: z.string(),
  // For the reviewer: what's in the photo.
  description: z.string(),
});
export type ModerationVerdict = z.infer<typeof Verdict>;

const WHAT_IT_SHOULD_BE: Record<PhotoPurpose, string> = {
  flip_card: 'a photo of one baseball player from his high school years, ideally in uniform (a portrait, cropped 5x7)',
  headshot: "a headshot of one baseball player: his face and shoulders, like an official team headshot",
  back_hero: 'an action photo of one baseball player playing (batting, pitching, fielding, running) for his team, cropped as a wide strip',
  timeline_hero: 'a photo of one baseball player from that season: an action shot or a headshot',
  other_photo: 'a photo related to this baseball player (him, his team, a game, an award); anything appropriate qualifies',
  school_logo: "a high school's logo or crest (a graphic, not a photo of people)",
  team_logo: "a college or professional baseball team's logo (a graphic, not a photo of people)",
};

const SYSTEM = `You review photos that fans send to YAT?STATS, a site that follows high school baseball alumni through college and pro ball. Photos you approve go on the site immediately, where families and kids see them, so be careful, but don't reject good photos for small things.

Decide:
- "reject" if the photo is inappropriate for a family audience, has a visible photographer/stock watermark, is clearly not what the fan said it is, or is too blurry, dark or tiny to use. Also reject screenshots of social posts, memes, and photos that are mostly text.
- "approve" if it is appropriate, has no watermark, is usable, and clearly matches what it should be.
- "review" if you can't tell (for example, it's unclear whether it fits the type, or the image is borderline).

Don't try to identify who the person is from their face; judge only the kind of photo. A jersey or cap from another team is fine. reason_for_fan is shown to the fan only when you reject: one short, friendly sentence saying what to fix.`;

let client: Anthropic | null = null;

export function moderationEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function moderatePhoto(opts: {
  imageUrl: string;
  purpose: PhotoPurpose;
  playerName?: string | null;
  season?: { year?: number; team?: string; label?: string } | null;
  note?: string | null;
}): Promise<ModerationVerdict | null> {
  if (!moderationEnabled()) return null;
  client ||= new Anthropic();
  const season = opts.season?.year ? `${opts.season.year}${opts.season.team ? `, ${opts.season.team}` : ''}${opts.season.label ? ` (${opts.season.label})` : ''}` : '';
  const facts = [
    `Kind of photo the fan chose: ${photoTypeLabel(opts.purpose)}. It should be ${WHAT_IT_SHOULD_BE[opts.purpose]}.`,
    opts.playerName ? `Player: ${opts.playerName}.` : '',
    season ? `Season: ${season}.` : '',
    opts.note ? `The fan's note: "${opts.note.slice(0, 500)}"` : '',
  ].filter(Boolean).join('\n');

  try {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 2048,
      // A declined request is re-run on Anthropic's recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: 'low', format: betaZodOutputFormat(Verdict) },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: opts.imageUrl } },
          { type: 'text', text: facts },
        ],
      }],
    });
    if (response.stop_reason === 'refusal') {
      return { decision: 'review', appropriate: false, matches_type: false, watermark: false, quality_ok: false, reason_for_fan: '', description: 'The automatic check declined to review this photo.' };
    }
    const verdict = response.parsed_output;
    if (!verdict) return null;
    // The code, not the model, has the last word on the hard rules.
    if (!verdict.appropriate || verdict.watermark) return { ...verdict, decision: 'reject' };
    if (verdict.decision === 'approve' && (!verdict.matches_type || !verdict.quality_ok)) return { ...verdict, decision: 'review' };
    return verdict;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) console.error('[contribute] moderation rate limited');
    else if (error instanceof Anthropic.APIError) console.error('[contribute] moderation API error', error.status, error.message);
    else console.error('[contribute] moderation failed', error);
    return null;
  }
}
