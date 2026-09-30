const { is } = require('zod/locales');
const prisma = require('../../config/database');


exports.createClient = async (user, data) => {
    try {
        return await prisma.client.create({
            data: {
                orgId: BigInt(user.orgId),
                name: data.name,
                email: data.email ?? null,
                phone: data.phone ?? null,
                // Address
                streetAddress: data.address?.street ?? data.streetAddress ?? null,
                city: data.address?.city ?? data.city ?? null,
                state: data.address?.state ?? data.state ?? null,
                zipCode: data.address?.zipCode ?? data.zipCode ?? null,
                // 🌍 Business / tax
                country: data.country ?? null,
                companyType: data.companyType ?? null,
                // gstin: data.gstin ?? null,
                taxId: data.taxId ?? null,
                taxSystem: data.taxSystem ?? "NONE",
            }
        });
    } catch (error) {
        if (error.code === "P2002") {
            throw new Error(
                "Client with this name already exists for this organization"
            );
        }
        throw error;
    }
};


exports.listClient = async (user, page, limit) => {
    const offset = (page - 1) * limit;
    console.log("Organization ID:", user.orgId, "Page:", page, "Limit:", limit);
    return prisma.client.findMany({
        where: {
            orgId: BigInt(user.orgId),
            deletedAt: null,
        },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
    });
}

exports.getClientById = async (user, clientId) => {
    return prisma.client.findFirst({
        where: {
            orgId: BigInt(user.orgId),
            id: BigInt(clientId),
            deletedAt: null,
        }
    });
}

exports.updateClient = async ({ user, clientId, data }) => {
    console.log('Updating client with ID:', clientId, 'for organization:', user.orgId);
    return prisma.client.updateMany({
        where: {
            id: BigInt(clientId),
            orgId: BigInt(user.orgId),
            deletedAt: null,
        },
        data,
    });
};

/**
 * Retires a client instead of removing the row.
 *
 * A hard delete took the invoices with it: invoice_bills.clientId is ON DELETE
 * SET NULL, so every invoice that ever billed this client silently lost it - no
 * error, no warning, no count of what was touched. Every lookup here filters
 * deletedAt: null, so the client disappears from the UI either way, while the
 * invoices keep a row to point at.
 *
 * deletedAt: null in the where clause also makes this idempotent: deleting a
 * second time reports not-found rather than overwriting who deleted it, and when.
 */
exports.deleteClient = async ({ user, clientId }) => {
    return prisma.client.updateMany({
        where: {
            id: BigInt(clientId),
            orgId: BigInt(user.orgId),
            deletedAt: null,
        },
        data: {
            deletedAt: new Date(),
            deletedBy: BigInt(user.userId),
        },
    });
};
