module.exports = function buildBaseContext(user) {
  return {
    userName: user.name,
    role: user.role,
    orgId: user.orgId,
    orgName: user.organization?.name
  };
};

