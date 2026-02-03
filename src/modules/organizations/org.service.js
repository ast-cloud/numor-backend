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
      // 🏢 Basic info
      name: data.name,
      email: data.email,
      phone: data.phone,

      // 📍 Address
      streetAddress: data.streetAddress ?? data.address?.streetAddress ?? null,
      city: data.city ?? data.address?.city ?? null,
      state: data.state ?? data.address?.state ?? null,
      zipCode: data.zipCode ?? data.address?.zipCode ?? null,
      country: data.country ?? null,

      // 💰 Tax & branding
      taxId: data.taxId ?? null,
      logoUrl: data.logoUrl ?? null,

      // ✅ Status
      isActive: data.isActive ?? undefined,
      // createdAt / updatedAt handled automatically by Prisma
    },
  });
}

module.exports = {
  getById,
  update,
};
