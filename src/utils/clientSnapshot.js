/**
 * The billed party for one invoice.
 *
 * Prefers the columns stored on the invoice over the clients row it points at.
 * The pointer is not dependable: deleting a client sets clientId to NULL on every
 * invoice that used it, and editing one would otherwise change what past invoices
 * render. The snapshot is what was actually billed.
 *
 * Falls back to the relation so rows written before the snapshot existed, and any
 * caller that did not select the columns, still work.
 */
function clientForDisplay(invoice) {
  const related = invoice?.client ?? null;
  const pick = (snapshot, fallback) => snapshot ?? fallback ?? null;

  const zipCode = pick(invoice?.clientZipCode, related?.zipCode);

  return {
    name: pick(invoice?.clientName, related?.name),
    email: pick(invoice?.clientEmail, related?.email),
    phone: pick(invoice?.clientPhone, related?.phone),
    streetAddress: pick(invoice?.clientStreetAddress, related?.streetAddress),
    city: pick(invoice?.clientCity, related?.city),
    state: pick(invoice?.clientState, related?.state),
    zipCode,
    // The invoice template reads {{client.zip}}, while the model calls it
    // zipCode. Both are provided so the PDF stops printing a blank there.
    zip: zipCode,
    country: pick(invoice?.clientCountry, related?.country),
    taxId: pick(invoice?.clientTaxId, related?.taxId),
    taxSystem: pick(invoice?.clientTaxSystem, related?.taxSystem),
    companyType: pick(invoice?.clientCompanyType, related?.companyType),
  };
}

/** The columns clientForDisplay reads, for callers using an explicit select. */
const CLIENT_SNAPSHOT_COLUMNS = {
  clientName: true,
  clientEmail: true,
  clientPhone: true,
  clientStreetAddress: true,
  clientCity: true,
  clientState: true,
  clientZipCode: true,
  clientCountry: true,
  clientTaxId: true,
  clientTaxSystem: true,
  clientCompanyType: true,
};

module.exports = { clientForDisplay, CLIENT_SNAPSHOT_COLUMNS };
