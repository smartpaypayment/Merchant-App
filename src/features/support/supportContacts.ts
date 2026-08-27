/**
 * Support and grievance-redressal contact details (App-PRD Section 6.17).
 *
 * ## Why these are constants and not i18n strings
 *
 * A phone number is not a translation. Putting it in the language bundles would
 * mean eight copies to keep in step, and a typo in one script would silently
 * strand every merchant using that language at the exact moment they are trying
 * to escalate a complaint. The labels around these values are translated; the
 * values themselves live here once.
 *
 * ## These are placeholders
 *
 * The RBI's grievance-redressal requirement for payment operators is that a named
 * officer with reachable contact details is published — so shipping invented ones
 * would be worse than shipping none: a merchant would call a dead number believing
 * they had escalated. `CONTACTS_ARE_PLACEHOLDERS` is therefore `true` and the
 * screen renders `support.grievance.placeholderNote` while it stays true.
 *
 * Before release: replace every value below with the registered details and set
 * `CONTACTS_ARE_PLACEHOLDERS` to `false`. `supportContacts.test.ts` asserts the
 * two move together, so the note cannot be removed while the numbers are still
 * fake, and cannot linger once they are real.
 */

/** Flip to `false` in the same commit that replaces the values below. */
export const CONTACTS_ARE_PLACEHOLDERS = true;

/** Marker embedded in every placeholder value so it is recognisable in a log or screenshot. */
export const PLACEHOLDER_MARKER = 'PLACEHOLDER';

export interface GrievanceOfficer {
  name: string;
  email: string;
  /** E.164, so `tel:` works from any network. */
  phone: string;
}

/** Level 1 — customer support line. */
export const SUPPORT_PHONE = '+911800000000';

/** Level 1 — WhatsApp support. Digits only, as required by the wa.me path. */
export const SUPPORT_WHATSAPP = '911800000000';

/** Level 2 — nodal / grievance officer. */
export const NODAL_OFFICER: GrievanceOfficer = {
  name: `${PLACEHOLDER_MARKER} — Grievance Officer name`,
  email: `grievance.${PLACEHOLDER_MARKER.toLowerCase()}@example.invalid`,
  phone: '+911800000001',
};

/**
 * Level 3 — the RBI's Complaint Management System.
 *
 * This one is a real, public URL rather than a placeholder: it is RBI's own portal,
 * identical for every operator, so there is nothing for us to substitute.
 */
export const RBI_PORTAL_URL = 'https://cms.rbi.org.in';

/** `tel:` URL for the support line. */
export const supportPhoneUrl = (): string => `tel:${SUPPORT_PHONE}`;

/** `wa.me` URL for WhatsApp support. */
export const supportWhatsappUrl = (): string => `https://wa.me/${SUPPORT_WHATSAPP}`;
