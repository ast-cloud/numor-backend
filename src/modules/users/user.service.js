const bcrypt = require('bcrypt');
const prisma = require('../../config/database');

exports.createUser = async (admin, data)=>{
    const {email, name, userType, password} = data;
    const exists = await prisma.user.findUnique({where: {email}});
    if(exists){
        throw new Error('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    return prisma.user.create({
        data: {
            orgId: admin.orgId,
            email,
            name,
            userType,
            passwordHash,
        },
        select: {
            id: true,
            email: true,
            name: true,
            userType: true,
            isActive: true,
            createdAt: true,
        }
    })
}

exports.listUsers = async (admin)=>{
    return prisma.user.findMany({
        where: {orgId: admin.orgId},
        select: {
            id: true,
            email: true,
            name: true,
            userType: true,
            isActive: true,
            createdAt: true,
        }
    });
}

exports.getUser = async (admin, userId)=>{
    const user = await prisma.user.findFirst({
        where: {
            id: BigInt(userId),
            orgId: admin.orgId,
        },
        select: {
            id: true,
            email: true,
            name: true,
            userType: true,
            isActive: true,
            createdAt: true,
        }
    });
    if (!user) throw new Error('User not found');
    return user;
}


exports.updateUser = async (admin, userId, data) => {
    return prisma.user.updateMany({
        where: {
            id: BigInt(userId),
            orgId: admin.orgId,
        },
        data,
    });
};

exports.updateUserStatus = async (admin, userId, isActive) => {
    return prisma.user.updateMany({
        where: {
            id: BigInt(userId),
            orgId: admin.orgId,
        },
        data: { isActive },
    });
};