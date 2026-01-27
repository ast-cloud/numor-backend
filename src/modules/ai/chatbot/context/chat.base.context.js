module.exports = function buildBaseContext(user) {
  return {
    userId: user.userId,
    role: user.role,
    orgId: user.orgId,
    userType: user.userType
  };
};

