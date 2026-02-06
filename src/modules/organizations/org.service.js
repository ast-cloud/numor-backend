const prisma = require("../../config/database");

function getById(orgId) {
  return prisma.organization.findUnique({
    where: { id: BigInt(orgId) },
  });
}

function update(orgId, data) {
  return prisma.organization.update({
    where: { id: BigInt(orgId) },
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,

      streetAddress: data.streetAddress ?? data.address?.streetAddress ?? null,
      city: data.city ?? data.address?.city ?? null,
      state: data.state ?? data.address?.state ?? null,
      zipCode: data.zipCode ?? data.address?.zipCode ?? null,
      country: data.country ?? null,

      taxId: data.taxId ?? null,
      logoUrl: data.logoUrl ?? null,

      isActive: data.isActive ?? undefined,
    },
  });
}

module.exports = {
  getById,
  update,
};
