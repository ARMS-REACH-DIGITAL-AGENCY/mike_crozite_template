/**
 * GoHighLevel API v2 Helper
 * Handles all communication with the GoHighLevel API
 * Uses Private Integration Token (PIT) for authentication
 * Endpoint: https://services.leadconnectorhq.com
 */

interface GHLContactData {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  tags?: string[];
}

interface GHLContactResponse {
  contact?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    tags?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface GHLErrorResponse {
  error?: string;
  message?: string;
  [key: string]: unknown;
}

export function getGHLApiKey(): string | undefined {
  return (
    process.env.GHL_API_KEY ||
    process.env.HIGHLEVEL_API_KEY ||
    process.env.GOHIGHLEVEL_API_KEY ||
    process.env.GOHIGHLEVEL_AGENCY_API_KEY ||
    process.env.LEADCONNECTOR_API_KEY
  );
}

export function getGHLLocationId(): string | undefined {
  return (
    process.env.GHL_LOCATION_ID ||
    process.env.HIGHLEVEL_LOCATION_ID ||
    process.env.GOHIGHLEVEL_LOCATION_ID ||
    process.env.LEADCONNECTOR_LOCATION_ID
  );
}

/**
 * Create a contact in GoHighLevel and apply tags
 * @param contactData - The contact information to create
 * @param subdomain - The subdomain (e.g., "hamilton.az") to use as a tag
 * @returns The created contact data or an error
 */
export async function createGHLContact(
  contactData: GHLContactData,
  subdomain: string
): Promise<GHLContactResponse | GHLErrorResponse> {
  const apiKey = getGHLApiKey();
  const locationId = getGHLLocationId();

  if (!apiKey || !locationId) {
    console.error("GoHighLevel API credentials are not configured. API key:", !!apiKey, "Location ID:", !!locationId);
    return {
      error: "GoHighLevel API credentials are not configured",
    };
  }

  try {
    // Prepare the contact data with tags
    const tags = [subdomain, `source:yatstats`, ...(contactData.tags || [])];
    const payload = {
      firstName: contactData.firstName || "Subscriber",
      lastName: contactData.lastName || "",
      email: contactData.email,
      phone: contactData.phone || "",
      tags,
      source: "YatStats Website",
      locationId,
    };

    console.log("Creating GHL contact with payload:", JSON.stringify(payload));

    // Make the API request to GoHighLevel v2
    const response = await fetch(
      `https://services.leadconnectorhq.com/contacts/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "Version": "2021-07-28",
        },
        body: JSON.stringify(payload),
      }
    );

    const responseData = await response.json();

    if (!response.ok) {
      console.error("GoHighLevel API error:", response.status, JSON.stringify(responseData));
      return {
        error: `GoHighLevel API error: ${response.status}`,
        message: responseData.message || responseData.msg || "Unknown error",
      };
    }

    console.log("Contact created in GoHighLevel:", JSON.stringify(responseData));
    return responseData;
  } catch (error) {
    console.error("Error creating GoHighLevel contact:", error);
    return {
      error: "Failed to create contact in GoHighLevel",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Add a tag to an existing contact in GoHighLevel
 * @param contactId - The GoHighLevel contact ID
 * @param tag - The tag to add
 * @returns Success status or an error
 */
export async function addTagToGHLContact(
  contactId: string,
  tag: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = getGHLApiKey();

  if (!apiKey) {
    console.error("GoHighLevel API credentials are not configured");
    return {
      success: false,
      error: "GoHighLevel API credentials are not configured",
    };
  }

  try {
    const response = await fetch(
      `https://services.leadconnectorhq.com/contacts/${contactId}/tags`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "Version": "2021-07-28",
        },
        body: JSON.stringify({ tags: [tag] }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("GoHighLevel API error:", errorData);
      return {
        success: false,
        error: `GoHighLevel API error: ${response.status}`,
      };
    }

    console.log(`Tag "${tag}" added to contact ${contactId}`);
    return { success: true };
  } catch (error) {
    console.error("Error adding tag to GoHighLevel contact:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Look up a GoHighLevel contact by email address.
 * Returns the contact ID if found, or null.
 */
export async function lookupGHLContactByEmail(
  email: string
): Promise<string | null> {
  const apiKey = getGHLApiKey();
  const locationId = getGHLLocationId();

  if (!apiKey || !locationId) return null;

  try {
    const url = new URL("https://services.leadconnectorhq.com/contacts/search");
    url.searchParams.set("email", email);
    url.searchParams.set("locationId", locationId);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        Version: "2021-07-28",
      },
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      contacts?: Array<{ id: string; email?: string }>;
    };
    const match = data.contacts?.find(
      (c) => c.email?.toLowerCase() === email.toLowerCase()
    );
    return match?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Find an existing GHL contact by email, or create a new one.
 * Prevents duplicate contacts on repeated registration / login.
 * Returns the GHL contact ID or null on failure.
 *
 * @param homeHsid  - Numeric school ID (e.g. "9655") — stored as tag "hsid:9655"
 * @param schoolName - Human-readable school name (e.g. "Basha High School") — stored as tag "school:Basha High School"
 */
export async function findOrCreateGhlContact(
  email: string,
  firstName?: string,
  lastName?: string,
  homeHsid?: string,
  schoolName?: string
): Promise<string | null> {
  // 1. Try to find an existing contact first
  const existingId = await lookupGHLContactByEmail(email);
  if (existingId) return existingId;

  // 2. Build school-specific tags so ARMS knows which microsite this fan came from
  const extraTags: string[] = [];
  if (homeHsid) extraTags.push(`hsid:${homeHsid}`);
  if (schoolName) extraTags.push(`school:${schoolName}`);

  // 3. Create a new contact
  const result = await createGHLContact(
    { email, firstName, lastName, tags: extraTags },
    "yatstats"
  );

  if ("error" in result) {
    console.error("findOrCreateGhlContact: failed to create contact", result);
    return null;
  }

  const contact = result.contact as { id?: string } | undefined;
  // GHL v2 returns { contact: { id, ... } } for create
  if (contact?.id) return contact.id;
  // Some responses return id at root
  if (typeof (result as Record<string, unknown>).id === "string") {
    return (result as Record<string, unknown>).id as string;
  }
  return null;
}

/**
 * Add a note to an existing contact in GoHighLevel (what a lead wrote).
 */
export async function addNoteToGHLContact(contactId: string, body: string): Promise<boolean> {
  const apiKey = getGHLApiKey();
  if (!apiKey) return false;
  try {
    const response = await fetch(`https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "Version": "2021-07-28",
      },
      body: JSON.stringify({ body }),
    });
    if (!response.ok) console.error("addNoteToGHLContact failed:", response.status);
    return response.ok;
  } catch (error) {
    console.error("addNoteToGHLContact error:", error);
    return false;
  }
}

/**
 * Send an email to a contact through GoHighLevel (Conversations), from the
 * location's default sender. Returns false when it couldn't be sent.
 */
export async function sendGHLEmail(contactId: string, subject: string, html: string, emailFrom?: string): Promise<boolean> {
  const apiKey = getGHLApiKey();
  if (!apiKey) return false;
  try {
    const response = await fetch("https://services.leadconnectorhq.com/conversations/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "Version": "2021-04-15",
      },
      body: JSON.stringify({ type: "Email", contactId, subject, html, ...(emailFrom ? { emailFrom } : {}) }),
    });
    if (!response.ok) console.error("sendGHLEmail failed:", response.status, (await response.text()).slice(0, 300));
    return response.ok;
  } catch (error) {
    console.error("sendGHLEmail error:", error);
    return false;
  }
}

/**
 * Mirror the platform's authoritative school and entitlement in ARMS.
 *
 * HighLevel's built-in contact "type" API only represents lead/customer;
 * use a dedicated contact custom field for FAN / SUPER FAN / SUPER FAN – PROMO.
 * Keep unrelated contact tags and custom fields intact.
 */
export async function syncYatstatsContact(
  contactId: string,
  profile: {
    home_hsid: string | null;
    plan: string | null;
    role: string | null;
    subscription_status: string | null;
    stripe_subscription_id: string | null;
    promo_code: string | null;
    promo_expires_at: Date | string | null;
  },
  school?: { hsname?: string | null; hslocation?: string | null } | null
): Promise<boolean> {
  const apiKey = getGHLApiKey();
  if (!apiKey || !contactId) return false;

  const isPaid = !!profile.stripe_subscription_id
    && ['active', 'trialing'].includes(String(profile.subscription_status || '').toLowerCase());
  const promoValid = !!profile.promo_code
    && (!profile.promo_expires_at || new Date(profile.promo_expires_at).getTime() > Date.now());
  const comped = ['demo_comped', 'demo-comped'].includes(String(profile.subscription_status || '').toLowerCase());
  const status = String(profile.subscription_status || '').toLowerCase();
  // Do not rely on a stale plan='superfan' after cancellation or promo expiry.
  const superfan = isPaid || promoValid || comped
    || (profile.plan === 'superfan' && !profile.promo_code && !profile.stripe_subscription_id
      && !['cancelled', 'canceled', 'unpaid', 'past_due'].includes(status));
  const memberLabel = superfan ? (isPaid ? 'SUPER FAN' : 'SUPER FAN – PROMO') : 'FAN';
  const tierTag = superfan ? (isPaid ? 'membership:superfan-paid' : 'membership:superfan-promo') : 'membership:fan';

  const schoolId = String(profile.home_hsid || '').trim();
  const schoolName = String(school?.hsname || '').trim();
  const location = String(school?.hslocation || '').replace(/\s*,\s*/g, ', ').trim();
  const schoolLabel = [schoolName, location].filter(Boolean).join(' — ');
  const schoolSource = schoolLabel ? `YAT?STATS — ${schoolLabel}` : undefined;
  const customFields: Array<{ id: string; fieldValue: string }> = [
    { id: 'qaazm5coKEqVbZxQKn9M', fieldValue: memberLabel },
    { id: 'ERQbXljhvoaoJ6JfmM8r', fieldValue: String(profile.promo_code || '') },
  ];
  if (schoolId) customFields.push({ id: 'AVS02RaVfIBGNyuWnDQo', fieldValue: schoolId });
  if (schoolLabel) customFields.push({ id: 'lKg1hakCnKkA7DyhRXmL', fieldValue: schoolLabel });

  try {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Version: 'v3',
    };
    const url = `https://services.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}`;
    const currentResponse = await fetch(url, { headers, cache: 'no-store' });
    if (!currentResponse.ok) {
      console.error('ARMS contact lookup failed during membership sync:', currentResponse.status);
      return false;
    }
    const current = (await currentResponse.json()) as {
      contact?: { tags?: string[]; customFields?: Array<{ id?: string; value?: string | null }> };
    };
    const previousTags = current.contact?.tags || [];
    const tags = previousTags.filter((tag) =>
      !/^membership:/i.test(tag) && tag.toLowerCase() !== 'superfan'
      && !/^promo:/i.test(tag)
      && (!schoolId || tag !== schoolId)
    );
    if (!tags.some((tag) => tag.toLowerCase() === 'source:yatstats')) tags.push('source:yatstats');
    tags.push(tierTag);
    if (superfan) tags.push('superfan');
    if (schoolId) tags.push(`hsid:${schoolId}`);
    if (schoolLabel) tags.push(`school:${schoolLabel}`);
    if (superfan && profile.promo_code && !isPaid) tags.push(`promo:${profile.promo_code}`);

    const updates = new Map<string, { id: string; fieldValue: string }>();
    for (const field of current.contact?.customFields || []) {
      if (field.id && typeof field.value === 'string') {
        updates.set(field.id, { id: field.id, fieldValue: field.value });
      }
    }
    for (const field of customFields) updates.set(field.id, field);
    const body = { tags: [...new Set(tags)], customFields: [...updates.values()], ...(schoolSource ? { source: schoolSource } : {}) };
    const response = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body), cache: 'no-store' });
    if (!response.ok) {
      console.error('ARMS contact update failed during membership sync:', response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error('ARMS contact membership sync failed:', error);
    return false;
  }
}
