function allowRoles(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.userType)) {
            return res.status(403).json({ 
                success: false,
                message: 'Forbidden: Access is denied' 
            });
        }
        next();
    };
}
module.exports = allowRoles;