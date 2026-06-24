const prisma = require("../../config/database");
const storageService = require('../../storage/storage.service');

async function getById(orgId) {
  return prisma.organization.findUnique({
    where: { id: BigInt(orgId) },
    include: {
      customFieldDefinitions: {
        select: {
          id: true,
          name: true,
          predefinedValues: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
}

async function update(orgId, data) {
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

async function uploadLogo(user, file) {
  const existing = await prisma.organization.findUnique({
    where: { id: BigInt(user.orgId) },
    select: { logoUrl: true }
  });

  if (existing?.logoUrl) {
    await storageService.remove(existing.logoUrl);
  }
  const allowedImageTypes = [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/jfif"
  ];

  if (!allowedImageTypes.includes(file.mimetype)) {
    throw new Error("Profile photo must be PNG, JPG, JPEG, WEBP or JFIF");
  }

  fileKey = `organization/org-logo/${user.orgId}/${Date.now()}-${file.originalname}`;
  const fileBuffer = file.buffer;

  await storageService.upload(fileKey, fileBuffer, file.mimetype);
  await prisma.organization.update({
    where: { id: user.orgId },
    data: {
      logoUrl: fileKey
    }
  });
    // generate signed URL
  const signedUrl = await storageService.getSignedUrl(fileKey);

  return signedUrl;

};

async function getLogo(user) {

  const dbUser = await prisma.organization.findUnique({
    where: { id: BigInt(user.orgId) },
    select: { logoUrl: true }
  });

  if (!dbUser || !dbUser.logoUrl) {
    return { logoUrl: null };
  }

  const url = await storageService.getSignedUrl(dbUser.logoUrl);

  return url;
};

async function deleteLogo(user) {

  const dbUser = await prisma.organization.findUnique({
    where: { id: BigInt(user.orgId) },
    select: { logoUrl: true }
  });

  if (dbUser && dbUser.logoUrl) {
    await storageService.remove(dbUser.logoUrl);
    await prisma.organization.update({
      where: { id: BigInt(user.orgId) },
      data: { logoUrl: null }
    });
  }
}

async function listCustomFieldDefinitions(user) {
  return prisma.customFieldDefinition.findMany({
    where: { orgId: BigInt(user.orgId) },
    orderBy: { createdAt: "asc" },
  });
}

async function createCustomFieldDefinition(user, data) {
  const existing = await prisma.customFieldDefinition.findUnique({
    where: {
      orgId_name: { orgId: BigInt(user.orgId), name: data.name }
    }
  });

  if (existing) {
    throw new Error("A custom field with this name already exists.");
  }

  return prisma.customFieldDefinition.create({
    data: {
      orgId: BigInt(user.orgId),
      name: data.name,
      predefinedValues: data.predefinedValues || [],
    }
  });
}

async function updateCustomFieldDefinition(user, id, data) {
  const existing = await prisma.customFieldDefinition.findFirst({
    where: { id: BigInt(id), orgId: BigInt(user.orgId) }
  });
  if (!existing) throw new Error("Custom field not found.");

  return prisma.customFieldDefinition.update({
    where: { id: BigInt(id) },
    data: {
      name: data.name,
      predefinedValues: data.predefinedValues,
    }
  });
}

async function deleteCustomFieldDefinition(user, id) {
  const existing = await prisma.customFieldDefinition.findFirst({
    where: { id: BigInt(id), orgId: BigInt(user.orgId) }
  });
  if (!existing) throw new Error("Custom field not found.");

  // Delete associated values on invoices to prevent foreign key constraint errors
  await prisma.invoiceCustomFieldValue.deleteMany({
    where: { customFieldId: BigInt(id) }
  });

  return prisma.customFieldDefinition.delete({
    where: { id: BigInt(id) }
  });
}

async function getCustomUnits(user) {
  const org = await prisma.organization.findUnique({
    where: { id: BigInt(user.orgId) },
    select: { customUnits: true },
  });
  return org?.customUnits ?? [];
}

async function addCustomUnit(user, unit) {
  const trimmed = (unit ?? "").trim();
  if (!trimmed) throw new Error("Unit name is required.");
  if (trimmed.length > 50) throw new Error("Unit name must be 50 characters or fewer.");

  const org = await prisma.organization.findUnique({
    where: { id: BigInt(user.orgId) },
    select: { customUnits: true },
  });
  const current = org?.customUnits ?? [];
  if (current.map(u => u.toLowerCase()).includes(trimmed.toLowerCase())) {
    throw new Error("This unit already exists.");
  }

  const updated = await prisma.organization.update({
    where: { id: BigInt(user.orgId) },
    data: { customUnits: { push: trimmed } },
    select: { customUnits: true },
  });
  return updated.customUnits;
}

async function deleteCustomUnit(user, unit) {
  const org = await prisma.organization.findUnique({
    where: { id: BigInt(user.orgId) },
    select: { customUnits: true },
  });
  const current = org?.customUnits ?? [];
  const next = current.filter(u => u !== unit);
  if (next.length === current.length) throw new Error("Unit not found.");

  const updated = await prisma.organization.update({
    where: { id: BigInt(user.orgId) },
    data: { customUnits: { set: next } },
    select: { customUnits: true },
  });
  return updated.customUnits;
}

module.exports = {
  getById,
  update,
  uploadLogo,
  getLogo,
  deleteLogo,
  listCustomFieldDefinitions,
  createCustomFieldDefinition,
  updateCustomFieldDefinition,
  deleteCustomFieldDefinition,
  getCustomUnits,
  addCustomUnit,
  deleteCustomUnit,
};
