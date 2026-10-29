import { NextRequest, NextResponse } from "next/server";
import { lookupGHLContactByEmail, createGHLContact, getGHLLocationId, syncYatstatsContact, syncYatstatsSmsConsent } from "@/lib/gohighlevel";
import { getUserProfile, upsertUserProfile } from "@/lib/userProfile";
import { isSuperfan } from "@/lib/entitlements";
import { query } from "@/lib/db";
import { canonicalSchoolUrls } from "@/lib/schoolDirectoryRouting";
import { verifyFirebaseIdToken } from "@/lib/firebaseIdToken";
import { FAN_CONSENT_VERSION, FAN_SMS_DISCLOSURE, fanInformationalConsent, fanPromotionalConsent } from "@/lib/fanConsent";

export const runtime = "nodejs";

const PLATFORM_SESSION_COOKIE = "yat-platform-session";
const LEGACY_SESSION_COOKIE = "yat-session";

interface RegisterRequestBody {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  subdomain?: string;
  phone?: string;
  smsInformational?: boolean;
  smsPromotional?: boolean;
  disclosureVersion?: string;
  idToken?: string;
  sourceUrl?: string;
}

async function getSchoolByHsid(hsid: string) {
  const sql = `
    SELECT hsname, hslocation, microsite_url
    FROM school_success
    WHERE hsid::text = $1
    LIMIT 1
  `;
  const result = await query(sql, [String(hsid)]);
  const school: { hsname?: string | null; hslocation?: string | null; microsite_url?: string | null } | null = result.rows?.[0] ?? null;
  if (!school) return null;
  const urls = await canonicalSchoolUrls([hsid], (sql, params = []) => query(sql, params));
  return { ...school, microsite_url: urls.get(String(hsid)) || school.microsite_url };
}

function normalizeMicrositeUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  return raw.replace(/\/+$/, '');
}

function getCookieDomain(hostname: string | null) {
  if (!hostname) return undefined;
  const host = hostname.split(":")[0].toLowerCase();
  if (host === "yatstats.com" || host.endsWith(".yatstats.com")) return ".yatstats.com";
  return undefined;
}

function clearLegacySessionCookies(response: NextResponse, cookieDomain?: string) {
  const base = {
    name: LEGACY_SESSION_COOKIE,
    value: "",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    expires: new Date(0),
  };
  response.cookies.set(base);
  if (cookieDomain) response.cookies.set({ ...base, domain: cookieDomain });
}

export async function POST(request: NextRequest) {
  const body: RegisterRequestBody = await request.json().catch(
    () => ({} as RegisterRequestBody)
  );

  if (!body.uid || !body.email) {
    return NextResponse.json(
      { error: "uid and email are required" },
      { status: 400 }
    );
  }

  const smsInformational = body.smsInformational === true;
  const smsPromotional = body.smsPromotional === true;
  const phoneDigits = String(body.phone || "").replace(/\D/g, "");
  const normalizedDigits = phoneDigits.length === 11 && phoneDigits.startsWith("1") ? phoneDigits.slice(1) : phoneDigits;
  const phoneE164 = /^[2-9]\d{2}[2-9]\d{6}$/.test(normalizedDigits) ? "+1" + normalizedDigits : null;
  const hasSmsConsent = smsInformational || smsPromotional;
  if (hasSmsConsent && (!phoneE164 || body.disclosureVersion !== FAN_CONSENT_VERSION)) {
    return NextResponse.json({ error: "Valid phone number and current SMS disclosure required" }, { status: 400 });
  }
  // Signed Firebase proof is mandatory for recording permission to send texts.
  if (hasSmsConsent) {
    const verified = await verifyFirebaseIdToken(String(body.idToken || ""));
    if (!verified || verified.uid !== body.uid || verified.email.toLowerCase() !== body.email.toLowerCase()) {
      return NextResponse.json({ error: "Cannot verify SMS consent identity" }, { status: 401 });
    }
  }

  try {
    let profile = await getUserProfile(body.uid);

    if (!profile) {
      let armsContactId: string | null = null;
      try {
        armsContactId = await lookupGHLContactByEmail(body.email);
      } catch (err) {
        console.error("GHL lookup failed (non-fatal):", err);
      }

      if (!armsContactId) {
        try {
          const created = await createGHLContact(
            {
              email: body.email,
              firstName: body.firstName ?? "",
              lastName: body.lastName ?? "",
            },
            body.subdomain ?? "yatstats"
          );

          if (!("error" in created)) {
            const createdContact = (created as { contact?: { id?: string } }).contact;
            armsContactId = createdContact?.id ?? null;
          } else {
            console.error("GHL create failed (non-fatal):", created);
          }
        } catch (err) {
          console.error("GHL create failed (non-fatal):", err);
        }
      }

      profile = await upsertUserProfile(body.uid, {
        email: body.email,
        first_name: body.firstName ?? null,
        last_name: body.lastName ?? null,
        home_hsid: body.subdomain ?? null,
        plan: "fan",
        arms_contact_id: armsContactId,
        arms_location_id: getGHLLocationId() ?? null,
      });
    }

    if (!profile.home_hsid && body.subdomain) {
      profile = await upsertUserProfile(body.uid, {
        email: body.email,
        home_hsid: body.subdomain,
      });
    }

    let homeSchoolName: string | null = null;
    let homeSchoolLocation: string | null = null;
    let homeMicrositeUrl: string | null = null;

    if (profile.home_hsid) {
      try {
        const school = await getSchoolByHsid(String(profile.home_hsid));
        if (school) {
          homeSchoolName = school.hsname ?? null;
          homeSchoolLocation = school.hslocation ?? null;
          homeMicrositeUrl = normalizeMicrositeUrl(school.microsite_url);
        }
      } catch (schoolErr) {
        console.error("School lookup failed (non-fatal):", schoolErr);
      }
    }

    // A profile may have been created while the ARMS token was unavailable.
    // Repair only its missing CRM link, never create a duplicate when one exists.
    if (!profile.arms_contact_id) {
      try {
        let contactId = await lookupGHLContactByEmail(body.email);
        if (!contactId) {
          const created = await createGHLContact(
            { email: body.email, firstName: profile.first_name || body.firstName || '', lastName: profile.last_name || body.lastName || '' },
            String(profile.home_hsid || body.subdomain || 'yatstats')
          );
          if (!('error' in created)) contactId = (created as { contact?: { id?: string } }).contact?.id || null;
        }
        if (contactId) {
          profile = await upsertUserProfile(body.uid, { email: body.email, arms_contact_id: contactId });
        }
      } catch (error) {
        console.error('ARMS contact relink failed (non-fatal):', error);
      }
    }

    if (profile.arms_contact_id) {
      await syncYatstatsContact(profile.arms_contact_id, profile, {
        hsname: homeSchoolName,
        hslocation: homeSchoolLocation,
      });
    }

    // Save evidence before permitting any contact to enter an SMS workflow.
    // No inference from membership, registration, or a provided phone number.
    if (hasSmsConsent && phoneE164) {
      // Keep the auditable form URL without arbitrary share tokens, fantasy
      // state, or other personal information in query strings.
      let sourceUrl = "";
      let sourceHost = "";
      try {
        const form = new URL(String(body.sourceUrl || "").slice(0, 2048));
        sourceHost = form.hostname.toLowerCase();
        if (form.protocol !== "https:") throw new Error("HTTPS required");
        const browserOrigin = request.headers.get("origin");
        if (browserOrigin && new URL(browserOrigin).origin !== form.origin) {
          throw new Error("Form source does not match request origin");
        }
        const joinSuffix = form.searchParams.get("join") === "1" ? "?join=1" : "";
        sourceUrl = form.origin + form.pathname + joinSuffix;
      } catch {
        return NextResponse.json({ error: "Invalid SMS consent source" }, { status: 400 });
      }
      const isBrandDomain = sourceHost === "yatstats.com" || sourceHost.endsWith(".yatstats.com");
      const isPreview = process.env.VERCEL_ENV !== "production" && sourceHost.endsWith(".vercel.app");
      if (!isBrandDomain && !isPreview) {
        return NextResponse.json({ error: "Invalid SMS consent source" }, { status: 400 });
      }
      await query(`INSERT INTO fan_sms_consent_events
        (firebase_uid, email, contact_id, home_hsid, school_name, phone_e164,
         informational_opt_in, promotional_opt_in, disclosure_version, informational_disclosure,
         promotional_disclosure, shared_disclosure, source_url, user_agent)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [
          body.uid, body.email, profile.arms_contact_id, profile.home_hsid,
          homeSchoolName, phoneE164, smsInformational, smsPromotional, FAN_CONSENT_VERSION,
          fanInformationalConsent(homeSchoolName), fanPromotionalConsent(homeSchoolName),
          FAN_SMS_DISCLOSURE, sourceUrl, request.headers.get("user-agent") || ""
        ]);
      if (profile.arms_contact_id) {
        // Non-fatal: Firebase account registration must not fail because of a
        // transient ARMS API outage. SMS workflows must filter using the
        // category-specific tags AND honor HighLevel's native DND/STOP.
        const synced = await syncYatstatsSmsConsent(profile.arms_contact_id, phoneE164, {
          informational: smsInformational,
          promotional: smsPromotional,
        });
        if (!synced) console.error("[sms-consent] Consent saved locally; ARMS phone/tag sync pending");
      }
    }

    const superfan = isSuperfan(profile);
    const payload = {
      success: true,
      contactId: profile.arms_contact_id ?? null,
      plan: superfan ? "superfan" : profile.plan ?? "fan",
      isSuperfan: superfan,
      firstName: profile.first_name ?? body.firstName ?? null,
      homeHsid: profile.home_hsid ? String(profile.home_hsid) : (body.subdomain ?? null),
      homeSchoolName,
      homeSchoolLocation,
      homeMicrositeUrl,
      role: profile.role ?? "fan",
      subscriptionStatus: profile.subscription_status ?? null,
    };

    const sessionData = { uid: body.uid, email: body.email, ...payload };
    const response = NextResponse.json(payload);
    const cookieDomain = getCookieDomain(request.headers.get("host"));

    response.cookies.set({
      name: PLATFORM_SESSION_COOKIE,
      value: JSON.stringify(sessionData),
      ...(cookieDomain ? { domain: cookieDomain } : {}),
      path: "/",
      httpOnly: true,
      secure: true,
      // See the matching comment in api/auth/login/route.ts: Partitioned
      // (CHIPS) + SameSite=None so this cookie survives being read from
      // inside a cross-site iframe (the corporate site's live demo),
      // instead of being silently dropped under Chrome's third-party
      // cookie policy.
      sameSite: "none",
      partitioned: true,
      maxAge: 60 * 60 * 24 * 30,
    });

    clearLegacySessionCookies(response, cookieDomain);
    return response;
  } catch (error: any) {
    console.error("Register API error:", error);
    return NextResponse.json(
      {
        error: "Registration failed",
        message: error?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}
