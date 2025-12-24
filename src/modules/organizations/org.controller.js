const orgService = require("./org.service");

async function getMyOrganization(req, res) {
  const org = await orgService.getById(req.user.orgId);

  res.json({
    success: true,
    data: org,
  });
}

async function updateMyOrganization(req, res) {
  const org = await orgService.update(
    req.user.orgId,
    req.body
  );

  res.json({
    success: true,
    message: "Organization updated",
    data: org,
  });
}

module.exports = {
  getMyOrganization,
  updateMyOrganization,
};
