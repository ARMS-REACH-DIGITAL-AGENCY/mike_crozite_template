/**
 * GoHighLevel API Helper
 * Handles all communication with the GoHighLevel API
 * Used to create contacts and apply tags based on subdomain
 */

interface GHLContactData {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  tags?: string[];
}

interface GHLContactResponse {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  tags?: string[];
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
  const apiKey = process.env.GOHIGHLEVEL_AGENCY_API_KEY;
  const locationId = process.env.GOHIGHLEVEL_LOCATION_ID;

  if (!apiKey || !locationId) {
    console.error("GoHighLevel API credentials are not configured");
    return {
      error: "GoHighLevel API credentials are not configured",
    };
  }

  try {
    // Prepare the contact data with tags
    const tags = [subdomain, ...(contactData.tags || [])];
    const payload = {
      email: contactData.email,
      firstName: contactData.firstName || "Subscriber",
      lastName: contactData.lastName || "",
      phone: contactData.phone || "",
      tags,
    };

    // Make the API request to GoHighLevel
    const response = await fetch(
      `https://rest.gohighlevel.com/v1/contacts/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("GoHighLevel API error:", errorData);
      return {
        error: `GoHighLevel API error: ${response.status}`,
        message: errorData.message || "Unknown error",
      };
    }

    const createdContact = await response.json();
    console.log("Contact created in GoHighLevel:", createdContact);
    return createdContact;
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
  const apiKey = process.env.GOHIGHLEVEL_AGENCY_API_KEY;

  if (!apiKey) {
    console.error("GoHighLevel API credentials are not configured");
    return {
      success: false,
      error: "GoHighLevel API credentials are not configured",
    };
  }

  try {
    const response = await fetch(
      `https://rest.gohighlevel.com/v1/contacts/${contactId}/tags`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ tag }),
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
