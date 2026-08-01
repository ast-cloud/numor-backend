function allowRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.loggedInUser || !allowedRoles.includes(req.loggedInUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }
    next();
  };
}

module.exports = allowRoles;
