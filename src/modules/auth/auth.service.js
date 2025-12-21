const bcrypt = require('bcrypt');
const prisma = require('../../config/database');
const { signToken } = require('../../config/jwt');

async function registerUser(data) {
    const { orgId, email, password, name, userType = "INTERNAL" } = data;

    // 1. Check if user already exists
    const existingUser = await prisma.user.findUnique({
        where: { email },
    });

    if (!email || !password) {
        throw new Error("Email and password are required");
    }

    if (existingUser) {
        throw new Error('User with this email already exists');
    }

    // 2. Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. Create user
    const user = await prisma.user.create({
        data: {
            orgId: Number(orgId),
            email,
            name,
            userType,
            passwordHash
        }
    });
    const safeUser = convertBigIntToString({
        ...user,
        passwordHash: undefined
    });

    // Use safeUser.id and safeUser.orgId for JWT
    const token = signToken({
        userId: safeUser.id,
        orgId: safeUser.orgId,
        role: safeUser.role,
        userType: safeUser.userType,
    });

    return { safeUser, token };


}
async function loginUser(email, password) {
    // 1. Find user
    const user = await prisma.user.findUnique({
        where: { email },
    });

    if (!user || !user.passwordHash) {
        throw new Error("Invalid credentials");
    }

    // 2. Compare password
    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
        throw new Error("Invalid credentials");
    }

    // 3. Generate JWT
    const safeUser = convertBigIntToString({
        ...user,
        passwordHash: undefined
    });

    // Use safeUser.id and safeUser.orgId for JWT
    const token = signToken({
        userId: safeUser.id,
        orgId: safeUser.orgId,
        role: safeUser.role,
        userType: safeUser.userType,
    });

    return { safeUser, token };

}


function convertBigIntToString(obj) {
    if (typeof obj === 'bigint') {
        return obj.toString();
    }
    if (Array.isArray(obj)) {
        return obj.map(convertBigIntToString);
    }
    if (obj && typeof obj === 'object') {
        const newObj = {};
        for (const key in obj) {
            newObj[key] = convertBigIntToString(obj[key]);
        }
        return newObj;
    }
    return obj;
}

module.exports = {
    registerUser,
    loginUser,
};
