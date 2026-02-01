const { is } = require('zod/locales');
const prisma = require('../../config/database');


exports.createClient = async (user, data) => {
    try {
        return await prisma.client.create({
            data: {
                userId: BigInt(user.userId),
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
                gstin: data.gstin ?? null,
                taxId: data.taxId ?? null,
                taxSystem: data.taxSystem ?? "NONE",
                // ✅ Status
                isActive: data.isActive ?? true
            }
        });
    } catch (error) {
        if (error.code === "P2002") {
            throw new Error(
                "Client with this name already exists for this user"
            );
        }
        throw error;
    }
};


exports.listClient = async (user, page, limit) => {
    const offset = (page - 1) * limit;
    // console.log('User:', user);
    return prisma.client.findMany({
        where: {
            userId: BigInt(user.userId),
            isActive: true,
        },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
    });
}

exports.getClientById = async (user, clientId) => {
    return prisma.client.findUnique({
        where: {
            userId: BigInt(user.userId),
            id: BigInt(clientId),
            isActive: true,
        }
    });
}

exports.updateClient = async ({ user, clientId, data }) => {
    console.log('Updating client with ID:', clientId, 'for user:', user.userId);
    return prisma.client.updateMany({
        where: {
            id: BigInt(clientId),
            userId: BigInt(user.userId),
            isActive: true,
        },
        data,
    });
};

exports.deleteClient = async ({ user, clientId }) => {
    return prisma.client.updateMany({
        where: {
            id: BigInt(clientId),
            userId: BigInt(user.userId),
        },
        data: {
            isActive: false,
        },
    });
};
