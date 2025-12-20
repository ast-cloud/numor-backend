const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN
    })
}

function verifToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

module.exports = {
    signToken,
    verifToken
}