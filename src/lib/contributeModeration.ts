// src/lib/contributeModeration.ts
// Automatic review of a fan's photo, the moment it's sent: Claude looks at
// the staged (cropped) photo with what the fan said it is, and decides.
//   approve -> every family-safe image goes on the site right away
//   reject  -> clearly unsafe family content never publishes
//   review  -> reserved only for genuine safety uncertainty
// Visual quality, exact pose, season fit, multiple people, watermarks and
// placement quality are metadata, never reasons to strand a safe photo.
// Without ANTHROPIC_API_KEY nothing is decided automatically: the upload
// stays recoverable until the safety check is available.
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
export const CONTRIBUTE_MODERATION_POLICY_VERSION = 2;

const WHAT_IT_SHOULD_BE: Record<PhotoPurpose, string> = {
  flip_card: 'a photo of one baseball player from his high school years, ideally in uniform (a portrait, cropped 5x7)',
  headshot: "a headshot of one baseball player: his face and shoulders, like an official team headshot",
  back_hero: 'an action photo of one baseball player playing (batting, pitching, fielding, running) for his team, cropped as a wide strip',
  timeline_hero: 'a photo of one baseball player from that season: an action shot or a headshot',
  other_photo: 'a photo related to this baseball player (him, his team, a game, an award); anything appropriate qualifies',
  school_logo: "a high school's logo or crest (a graphic, not a photo of people)",
  team_logo: "a college or professional baseball team's logo (a graphic, not a photo of people)",
};

const SYSTEM = `You are the safety gate for fan photo uploads to YAT?STATS, a family baseball site. The product rule is social-post speed: if an image is safe for a family audience, it should publish immediately.

Your decision is about SAFETY, not art direction or placement quality.

- "reject" only when the image is clearly inappropriate for a family audience: nudity or sexual content, graphic violence or gore, hateful/extremist content, illegal drug use, or an obscene/abusive gesture.
- "review" only when you genuinely cannot determine whether the image is safe.
- "approve" every image that is family-safe, even when it is blurry, low resolution, oddly cropped, has multiple people, is not an ideal action pose, appears to be from a different season/team, contains text, is a screenshot, has a watermark, or is an imperfect match for the selected placement.

Still fill in matches_type, watermark and quality_ok accurately. Those fields are informational and must NOT cause a safe image to be rejected or held.

Do not try to identify a person from their face. reason_for_fan is only for a true safety rejection. description should briefly describe the image and any quality/type concerns without turning those concerns into a hold.`;

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
    if (!verdict) {
      console.error('[contribute] moderation returned no structured verdict', {
        stopReason: response.stop_reason,
        contentTypes: response.content.map((block) => block.type),
      });
      return null;
    }
    // The code, not the model, enforces the product contract:
    // family-safe photos publish. Type/quality/watermark flags are metadata.
    if (verdict.appropriate) return { ...verdict, decision: 'approve', reason_for_fan: '' };
    if (verdict.decision === 'review') return verdict;
    return { ...verdict, decision: 'reject' };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) console.error('[contribute] moderation rate limited');
    else if (error instanceof Anthropic.APIError) console.error('[contribute] moderation API error', error.status, error.message);
    else console.error('[contribute] moderation failed', error);
    return null;
  }
}
