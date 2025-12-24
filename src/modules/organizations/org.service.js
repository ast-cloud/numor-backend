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
      phone: data.phone,
      address: data.address,
      gstin: data.gstin,
      logoUrl: data.logoUrl,
    },
  });
}

module.exports = {
  getById,
  update,
};
