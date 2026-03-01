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
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey || !locationId) {
    console.error("GoHighLevel API credentials are not configured. GHL_API_KEY:", !!apiKey, "GHL_LOCATION_ID:", !!locationId);
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
  const apiKey = process.env.GHL_API_KEY;

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
