import {
  CONTACTS_ARE_PLACEHOLDERS,
  NODAL_OFFICER,
  PLACEHOLDER_MARKER,
  RBI_PORTAL_URL,
  SUPPORT_PHONE,
  SUPPORT_WHATSAPP,
  supportPhoneUrl,
  supportWhatsappUrl,
} from './supportContacts';

/**
 * Guards the grievance-contact placeholders.
 *
 * The failure this prevents is a merchant escalating a complaint to an invented
 * phone number while the app tells them nothing is wrong. So the flag and the
 * values are asserted to move together: you cannot drop the on-screen warning
 * while the details are still fake, and the warning cannot outlive them.
 */

describe('grievance contacts', () => {
  it('keeps the placeholder flag in step with the values', () => {
    const looksLikePlaceholder =
      NODAL_OFFICER.name.includes(PLACEHOLDER_MARKER) ||
      NODAL_OFFICER.email.includes(PLACEHOLDER_MARKER.toLowerCase()) ||
      NODAL_OFFICER.email.endsWith('.invalid');

    // If this fails, either real details landed without clearing the flag, or the
    // flag was cleared while the values are still placeholders.
    expect(looksLikePlaceholder).toBe(CONTACTS_ARE_PLACEHOLDERS);
  });

  it('uses a reserved TLD for the placeholder email so it cannot reach a real inbox', () => {
    if (!CONTACTS_ARE_PLACEHOLDERS) return;
    // RFC 2606 reserves `.invalid`; a typo'd real domain could belong to someone.
    expect(NODAL_OFFICER.email).toMatch(/\.invalid$/);
  });

  it('exposes a non-empty officer name, email and phone', () => {
    expect(NODAL_OFFICER.name.trim().length).toBeGreaterThan(0);
    expect(NODAL_OFFICER.email.trim().length).toBeGreaterThan(0);
    expect(NODAL_OFFICER.phone.trim().length).toBeGreaterThan(0);
  });
});

describe('contact number formats', () => {
  it('stores the support line in E.164 so tel: works on any network', () => {
    expect(SUPPORT_PHONE).toMatch(/^\+\d{8,15}$/);
    expect(NODAL_OFFICER.phone).toMatch(/^\+\d{8,15}$/);
  });

  it('stores the WhatsApp number as digits only, as wa.me requires', () => {
    // A leading `+` in the wa.me path yields a broken link rather than an error.
    expect(SUPPORT_WHATSAPP).toMatch(/^\d{8,15}$/);
  });

  it('builds a tel: URL from the support line', () => {
    expect(supportPhoneUrl()).toBe(`tel:${SUPPORT_PHONE}`);
  });

  it('builds an https wa.me URL', () => {
    expect(supportWhatsappUrl()).toBe(`https://wa.me/${SUPPORT_WHATSAPP}`);
    expect(supportWhatsappUrl()).toMatch(/^https:\/\//);
  });
});

describe('RBI escalation target', () => {
  it('points at the RBI complaint portal over https', () => {
    // Not a placeholder: RBI's CMS is the same for every operator.
    expect(RBI_PORTAL_URL).toBe('https://cms.rbi.org.in');
    expect(RBI_PORTAL_URL).not.toContain(PLACEHOLDER_MARKER);
  });
});
