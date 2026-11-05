// Pure, safe classifications for Meta Business Discovery sync failures.
// Do not log access tokens or infer that a successful cron means all accounts synced.
export type InstagramSyncErrorCategory = 'auth_invalid' | 'rate_limited' | 'unavailable_account' | 'other';

export function classifyInstagramSyncError(raw: string): InstagramSyncErrorCategory {
  const message = String(raw || '').toLowerCase();
  if (['error validating access token', 'session has been invalidated',
    'invalid oauth access token', 'invalid access token', 'access token has expired',
    'oauthaccesstokenexception', 'error code 190'].some(fragment => message.includes(fragment))) {
    return 'auth_invalid';
  }
  if (['application request limit reached', 'rate limit', 'rate-limit',
    'too many calls', 'request limit', 'throttl', '(#4)', '(#17)',
    '(#32)', '(#613)'].some(fragment => message.includes(fragment))) {
    return 'rate_limited';
  }
  if (['invalid user id', 'business discovery returned no account',
    'user not found', 'not a business or creator'].some(fragment => message.includes(fragment))) {
    return 'unavailable_account';
  }
  return 'other';
}

export function isGlobalInstagramFailure(category?: InstagramSyncErrorCategory): boolean {
  return category === 'auth_invalid' || category === 'rate_limited';
}
