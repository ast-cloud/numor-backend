const jwt = require('jsonwebtoken');

function authMiddleware(req, res,next){
    const authHeader = req.headers.authorization;

    if(!authHeader || !authHeader.startsWith('Bearer ')){
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    // Authorization: Bearer <token> == Authorizatoin:  [0][1]
    const token = authHeader.split(' ')[1];

    try{
        const decode = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decode; // { userId, orgId, userType }
        next();
    }
    catch(err){
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
}

module.exports = authMiddleware;