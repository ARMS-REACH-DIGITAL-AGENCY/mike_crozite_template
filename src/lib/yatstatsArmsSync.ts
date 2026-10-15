export async function syncYatstatsArmsContact(input: { email: string; firstName?: string | null; lastName?: string | null; homeHsid: string }): Promise<string | null> {
  const secret = process.env.YATSTATS_CONTACT_SYNC_SECRET;
  const endpoint = process.env.ARMS_CONTACT_SYNC_URL;
  if (!secret || !endpoint) {
    console.error("ARMS contact sync is not configured");
    return null;
  }
  try {
    const result = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + secret },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!result.ok) {
      console.error("ARMS contact sync failed", result.status);
      return null;
    }
    const data = await result.json() as { ok?: boolean; contactId?: string };
    return data.ok && data.contactId ? data.contactId : null;
  } catch (error) {
    console.error("ARMS contact sync connection error", error instanceof Error ? error.message : "unknown");
    return null;
  }
}
