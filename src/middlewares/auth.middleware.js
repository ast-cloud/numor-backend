const jwt = require('jsonwebtoken');
const { success } = require('zod');

// function authMiddleware(req, res,next){
//     const authHeader = req.headers.authorization;

//     if(!authHeader || !authHeader.startsWith('Bearer ')){
//         return res.status(401).json({ success: false, message: 'Unauthorized' });
//     }
//     // Authorization: Bearer <token> == Authorizatoin:  [0][1]
//     const token = authHeader.split(' ')[1];

//     try{
//         const decode = jwt.verify(token, process.env.JWT_SECRET);
//         req.user = decode; // { userId, orgId, userType }
//         next();
//     }
//     catch(err){
//         return res.status(401).json({ success: false, message: 'Invalid token' });
//     }
// }

function authMiddleware(req, res, next) {
    // const token = req.cookies?.access_token;

    
    // 1. Get the Authorization header (usually looks like "Bearer eyJhbG...")
    const authHeader = req.headers.authorization;

    // 2. Check if header exists and starts with "Bearer "
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ 
            success: false, 
            message: "Unauthorized: No token provided" 
        });
    }

    // 3. Extract the actual token string
    const token = authHeader.split(" ")[1];


    if (!token){
        return res.status(401).json({success: false, message: "Unauthorized"});
    }

    try{
        const decode = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decode;
        next();
    }
    catch(err){
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
}

module.exports = authMiddleware;