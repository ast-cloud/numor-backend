const bcrypt = require('bcrypt');
const prisma = require('../../config/database');
const { signToken } = require('../../config/jwt');
const fetch = require('node-fetch');

async function registerUser(data) {
    const { user, organization } = data;

    if (!user.email) {
        throw new Error("User email is required");
    }

    return prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({
            where: { email: user.email }
        });

        if (existingUser) {
            throw new Error('User with this email already exists');
        }

        const org = await tx.organization.create({
            data: {
                name: `${user.name}'s Organization`,
                email: user.email
            }
        });

        const passwordHash = user.password
            ? await bcrypt.hash(user.password, 10)
            : null;

        const newUser = await tx.user.create({
            data: {
                orgId: org.id,
                name: user.name,
                email: user.email,
                // phone: user.phone,
                // address: user.address,
                passwordHash,
                authProvider: 'LOCAL',
                userType: 'INTERNAL', 
                role: user.role || 'SME_USER',
            },
            include: {
                organization: true,
            },
        });

        /** 5️⃣ Generate JWT */
        const token = signToken(
            {
                userId: newUser.id.toString(),
                orgId: org.id.toString(),
                role: newUser.role,
                userType: newUser.userType,
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return { token, user: newUser };
    });
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

async function googleAuth(code) {

    const params = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString()
    });

    if (!tokenRes.ok) {
      const error = await tokenRes.text();
      console.error("Google token error:", error);
      throw new Error("Failed to exchange code for token");
    }

    const { id_token } = await tokenRes.json();
    const googleUser = JSON.parse(
      Buffer.from(id_token.split(".")[1], "base64").toString()
    );


    const { sub, email, name, picture } = googleUser;

    if (!email) {
        throw new Error("Google account has no email associated");
    }

    let user = await prisma.user.findUnique({
        where: { email },
    });

    if (user) {
        if (!user.googleId) {
            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    googleId: sub,
                    authProvider: 'GOOGLE',
                },
            });
        }
    }
    else {
        const org = await prisma.organization.create({
            data: {
                name: `${name}'s Organization`,
                email,
            },
        });
        user = await prisma.user.create({
            data: {
                orgId: org.id,
                name,
                email,
                googleId: sub,
                authProvider: 'GOOGLE',
                userType: 'INTERNAL',
                role: 'SME_USER',
            },
        });
    }

    const token = signToken({
        userId: user.id,
        orgId: user.orgId,
        role: user.role,
        userType: user.userType,
    });

    return { token, user };
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
    googleAuth
};
