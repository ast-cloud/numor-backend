const { is } = require('zod/locales');
const prisma = require('../../config/database');


exports.createClient = async (user, data) => {
    try {
        return await prisma.client.create({
            data: {
                userId: BigInt(user.userId),
                name: data.name,
                email: data.email,
                phone: data.phone,
                address: data.address,
                gstin: data.gstin,
                country: data.country,
                companyType: data.companyType,
                taxId: data.taxId,
                taxSystem: data.taxSystem
            }
        });
    } catch (error) {
        if (error.code === 'P2002') {
            throw new Error('Client with this name already exists for this user');
        }
        throw error;
    }
}

exports.listClient = async (user) => {
    // console.log('User:', user);
    return prisma.client.findMany({
        where: {
            userId: BigInt(user.userId),
            isActive: true,
        },
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
