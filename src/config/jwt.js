const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('./env');

function signToken(payload) {
    return jwt.sign(
        payload, 
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN || '7d'
    })
}

function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

module.exports = {
    signToken,
    verifyToken
}