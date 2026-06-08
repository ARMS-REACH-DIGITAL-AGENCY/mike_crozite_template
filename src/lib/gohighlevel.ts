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
