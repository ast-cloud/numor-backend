const bcrypt = require('bcrypt');
const prisma = require('../../config/database');
const { signToken } = require('../../config/jwt');
const fetch = require('node-fetch');
const crypto = require("crypto");
const { sendEmail } = require("../../services/email.service");
const redis = require("../../redis/cache");
const { is } = require('zod/v4/locales');
const { SYSTEM_INVOICE_UNITS } = require("../../utils/constants");

async function registerUser(data) {
    const sessionId = crypto.randomUUID();
    const { user } = data;

    if (!user.email) {
        throw new Error("User email is required");
    }
    const key = `verified_email:${user.email}`;
    const isEmailVerified = (await redis.get(key)) ? true : false;
    if (isEmailVerified) {
        await redis.del(key);
    }

    return prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({
            where: { email: user.email }
        });

        if (existingUser) {
            if (existingUser.role === user.role)
                throw new Error('User with this email already exists');
            else if (existingUser.role == "CA_USER" && user.role == "SME_USER")
                throw new Error('User is already registered as CA.');
            else if (existingUser.role == "SME_USER" && user.role == "CA_USER") {     

                if (!user.password) {
                    throw new Error("Password is required to upgrade role");
                }

                let upgradedUser;
                
                if(!existingUser.passwordHash) { // Set password case

                    if (!isEmailVerified) {
                      throw new Error("Email must be verified to upgrade role to CA");
                    }

                    const passwordHash = await bcrypt.hash(user.password, 10);

                    upgradedUser = await tx.user.update({
                        where: { id: existingUser.id },
                        data: { role: "CA_USER", passwordHash: passwordHash },
                        include: { organization: true },
                    });

                }
                else{ // Verify password case

                    const isPasswordValid = await bcrypt.compare(
                        user.password,
                        existingUser.passwordHash
                    );

                    if (!isPasswordValid) {
                        throw new Error("Invalid credentials. Cannot upgrade role.");
                    }

                    upgradedUser = await tx.user.update({
                        where: { id: existingUser.id },
                        data: { role: "CA_USER" },
                        include: { organization: true }
                    });

                }


                const token = signToken(
                    {
                        userId: upgradedUser.id.toString(),
                        orgId: upgradedUser.orgId.toString(),
                        role: upgradedUser.role,
                        userType: upgradedUser.userType,
                        sessionId
                    },
                    process.env.JWT_SECRET,
                    { expiresIn: '7d' }
                );

                return { token, user: {...upgradedUser, passwordHash: null} };
            }
        }

        const org = await tx.organization.create({
            data: {
                name: `${user.name}'s Organization`,
                email: user.email,
                activeUnitsInvoice: SYSTEM_INVOICE_UNITS
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
                isEmailVerified,
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
                sessionId
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return { token, user: newUser };
    });
}

async function loginUser(email, password) {
    const sessionId = crypto.randomUUID();
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
        sessionId
    });

    return { safeUser, token };

}

async function googleAuth(code, user_type_for_signup) {
    const sessionId = crypto.randomUUID();

    if (!code) {
        throw new Error("Authorization code is required");
    }

    let redirect_uri;
    let role = undefined;

    if (user_type_for_signup === "CA_USER") {
        redirect_uri = process.env.GOOGLE_REDIRECT_URI_CA_SIGNUP;
        role = "CA_USER";
    }
    else if (user_type_for_signup === "SME_USER") {
        redirect_uri = process.env.GOOGLE_REDIRECT_URI_SME_SIGNUP;
        role = "SME_USER";
    }
    else {
        redirect_uri = process.env.GOOGLE_REDIRECT_URI_LOGIN;
    }

    const params = new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri,
        grant_type: "authorization_code",
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
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

        const shouldUpdateRole = (user.role === "SME_USER" && role === "CA_USER");

        user = await prisma.user.update({
            where: { id: user.id },
            data: {
                isEmailVerified: true,
                googleId: sub,
                authProvider: "GOOGLE",
                ...(shouldUpdateRole && { role })
            },
        });
    }
    else {
        const org = await prisma.organization.create({
            data: {
                name: `${name}'s Organization`,
                email,
                activeUnitsInvoice: SYSTEM_INVOICE_UNITS,
            },
        });

        user = await prisma.user.create({
            data: {
                orgId: org.id,
                name,
                email,
                isEmailVerified: true,
                googleId: sub,
                authProvider: "GOOGLE",
                userType: "INTERNAL",
                role: role ?? "SME_USER",
            },
        });
    }

    const token = signToken({
        userId: user.id,
        orgId: user.orgId,
        role: user.role,
        userType: user.userType,
        sessionId
    });

    return { token, user };
}

async function linkedinAuth(code, user_type_for_signup) {
    const sessionId = crypto.randomUUID();

    if (!code) {
        throw new Error("Authorization code is required");
    }

    let redirect_uri;
    let role;

    if (user_type_for_signup === "CA_USER") {
        redirect_uri = process.env.LINKEDIN_REDIRECT_URI_CA_SIGNUP;
        role = "CA_USER";
    } else if (user_type_for_signup === "SME_USER") {
        redirect_uri = process.env.LINKEDIN_REDIRECT_URI_SME_SIGNUP;
        role = "SME_USER";
    } else {
        redirect_uri = process.env.LINKEDIN_REDIRECT_URI_LOGIN;
    }

    // Step 1: Exchange code for access token
    const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
    });

    const tokenRes = await fetch(
        "https://www.linkedin.com/oauth/v2/accessToken",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
        }
    );

    if (!tokenRes.ok) {
        const error = await tokenRes.text();
        console.error("LinkedIn token error:", error);
        throw new Error("Failed to exchange code for token");
    }

    const { access_token } = await tokenRes.json();

    // Step 2: Fetch user info
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: {
            Authorization: `Bearer ${access_token}`,
        },
    });

    if (!profileRes.ok) {
        const error = await profileRes.text();
        console.error("LinkedIn profile error:", error);
        throw new Error("Failed to fetch LinkedIn profile");
    }

    const linkedinUser = await profileRes.json();

    const {
        sub: linkedinId,
        email,
        name,
        picture
    } = linkedinUser;

    if (!email) {
        throw new Error("LinkedIn account has no email");
    }

    // Step 3: Find or create user
    let user = await prisma.user.findUnique({
        where: { email },
    });

    if (user) {
        const shouldUpdateRole =
            user.role === "SME_USER" && role === "CA_USER";

        user = await prisma.user.update({
            where: { id: user.id },
            data: {
                isEmailVerified: true,
                linkedinId,
                authProvider: "LINKEDIN",
                ...(shouldUpdateRole && { role }),
            },
        });
    } else {
        const org = await prisma.organization.create({
            data: {
                name: `${name}'s Organization`,
                email,
                activeUnitsInvoice: SYSTEM_INVOICE_UNITS,
            },
        });

        user = await prisma.user.create({
            data: {
                orgId: org.id,
                name,
                email,
                isEmailVerified: true,
                linkedinId,
                authProvider: "LINKEDIN",
                userType: "INTERNAL",
                role: role ?? "SME_USER",
            },
        });
    }

    const token = signToken({
        userId: user.id,
        orgId: user.orgId,
        role: user.role,
        userType: user.userType,
        sessionId,
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

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function forgetPassword(email) {
    try {
        if (!email) {
            throw new Error("Email is required");
        }

        const dbUser = await prisma.user.findUnique({
            where: { email }
        });

        if (!dbUser) {
            throw new Error("User not found");
        }

        const otp = generateOTP();

        // Hash OTP before storing (important security step)
        const hashedOtp = await bcrypt.hash(otp, 10);

        const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

        await prisma.user.update({
            where: { id: dbUser.id },
            data: {
                resetPasswordToken: hashedOtp,
                resetPasswordExpiresAt: expiry
            }
        });

        const response = await sendEmail({
            to: dbUser.email,
            subject: "Numor Password Reset Code",
            html: `
        <h2>Password Reset</h2>
        <p>Your verification code is:</p>
        <h1>${otp}</h1>
        <p>This code will expire in 10 minutes.</p>
      `
        });

        if (response?.error) {
            throw new Error(response.error.message);
        }
        return { email: dbUser.email };
    } catch (error) {
        throw error;
    }
}

async function verifyResetCode(email, code) {
    const user = await prisma.user.findUnique({
        where: { email }
    });

    if (!user || !user.resetPasswordToken) {
        throw new Error("Invalid request");
    }

    if (new Date() > user.resetPasswordExpiresAt) {
        throw new Error("Code expired");
    }

    const isValid = await bcrypt.compare(code, user.resetPasswordToken);

    if (!isValid) {
        throw new Error("Invalid verification code");
    }

    return { verified: true };
}

async function resetPassword(email, code, newPassword) {
    const user = await prisma.user.findUnique({
        where: { email }
    });

    if (!user || !user.resetPasswordToken) {
        throw new Error("Invalid request");
    }

    if (new Date() > user.resetPasswordExpiresAt) {
        throw new Error("Code expired");
    }

    const isValid = await bcrypt.compare(code, user.resetPasswordToken);

    if (!isValid) {
        throw new Error("Invalid verification code");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
        where: { id: user.id },
        data: {
            passwordHash: hashedPassword,
            resetPasswordToken: null,
            resetPasswordExpiresAt: null
        }
    });

    return { success: true };
}

async function verifyInvitation(token) {
    const invitation = await prisma.userInvitation.findUnique({
        where: { token },
        include: {
            organization: {
                select: {
                    name: true,
                },
            },
        },
    });

    if (!invitation) {
        throw new Error("Invalid invitation");
    }

    if (new Date() > invitation.expiresAt) {
        await prisma.userInvitation.delete({
            where: { id: invitation.id },
        });
        throw new Error("Invitation has expired");
    }

    const existingUser = await prisma.user.findUnique({
        where: { email: invitation.email },
        select: { id: true },
    });

    if (existingUser) {
        throw new Error("User with this email already exists");
    }

    return {
        email: invitation.email,
        organizationName: invitation.organization?.name,
        expiresAt: invitation.expiresAt,
    };
}

async function createSubAccount(data) {
    const { token, name, password, phone } = data;

    const invitation = await prisma.userInvitation.findUnique({
        where: { token },
    });

    if (!invitation) {
        throw new Error("Invalid invitation");
    }

    if (new Date() > invitation.expiresAt) {
        await prisma.userInvitation.delete({
            where: { id: invitation.id },
        });
        throw new Error("Invitation has expired");
    }

    const existingUser = await prisma.user.findUnique({
        where: { email: invitation.email },
        select: { id: true },
    });

    if (existingUser) {
        throw new Error("User with this email already exists");
    }

    const sessionId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                orgId: invitation.organizationId,
                name,
                email: invitation.email,
                phone,
                passwordHash,
                authProvider: "LOCAL",
                userType: "INTERNAL",
                role: "SME_USER",
                isOrgOwner: false,
                permissions: invitation.permissions,
                isEmailVerified: true,
            },
            include: {
                organization: true,
            },
        });

        await tx.userInvitation.delete({
            where: { id: invitation.id },
        });

        return user;
    });

    const tokenPayload = {
        userId: newUser.id.toString(),
        orgId: newUser.orgId.toString(),
        role: newUser.role,
        userType: newUser.userType,
        sessionId,
    };

    const authToken = signToken(tokenPayload);

    return {
        token: authToken,
        user: convertBigIntToString({
            ...newUser,
            passwordHash: undefined,
        }),
    };
}

async function verifyEmail(email) {
    if (!email) {
        throw new Error("Email is required");
    }
    // Check if already registered
    const existingUser = await prisma.user.findUnique({
        where: { email },
    });

    if (existingUser) {
        return {
            success: false,
            message: "Email is already registered",
            currentRole: existingUser.role,
            passwordSet: !!existingUser.passwordHash
        }
    }

    // Generate OTP
    const otp = generateOTP();
    // Store OTP in Redis with expiry (5 minutes)
    const key = `email_verification:${email}`;

    const existingOtp = await redis.get(key);
    if (existingOtp) {
        throw new Error("OTP already sent. Please wait before requesting again.");
    }
    await redis.set(key, otp, { ex: 300 }); // 300 seconds
    // Send Email
    const response = await sendEmail({
        to: email,
        subject: "Numor Email Verification Code",
        html: `
                <h2>Email Verification</h2>
                <p>Your verification code is:</p>
                <h1>${otp}</h1>
                <p>This code will expire in 5 minutes.</p>
      `,
    });

    if (response?.error) {
        throw new Error(response.error.message);
    }

    return {
        success: true,
        message: "OTP sent successfully",
        email,
        currentRole: existingUser?.role,
        passwordSet: !!existingUser?.passwordHash
    };
}

async function verifyEmailOTP(email, code) {
    if (!email || !code) {
        throw new Error("Email and Code are required");
    }

    const key = `email_verification:${email}`;

    const storedOtp = await redis.get(key);

    if (!storedOtp) {
        throw new Error("Code expired or not found");
    }
    console.log("Stored OTP:", storedOtp, "Provided Code:", code);
    if (storedOtp != code) {
        throw new Error("Invalid Code");
    }

    // delete OTP after verification
    await redis.del(key);
    await redis.set(`verified_email:${email}`, "true", { ex: 3600 }); // Mark email as verified for 1 hour

    return {
        success: true,
        message: "Email verified successfully",
        email,
    };
}
module.exports = {
    registerUser,
    loginUser,
    googleAuth,
    forgetPassword,
    resetPassword,
    verifyResetCode,
    verifyInvitation,
    createSubAccount,
    verifyEmail,
    verifyEmailOTP,
    linkedinAuth
};
