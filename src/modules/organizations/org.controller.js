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

async function uploadLogo(req, res, next) {
  try {
    const user = req.user;
    const file = req.file;
    const logoUrl = await orgService.uploadLogo(user, file);
    res.json({ success: true, logoUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

async function getLogo(req, res, next) {
  try {
    const user = req.user;
    const logoUrl = await orgService.getLogo(user);
    res.json({ success: true, logoUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function deleteLogo(req, res, next) {
  try {
    const user = req.user;
    await orgService.deleteLogo(user);
    res.json({ success: true, message: "Logo deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function listCustomFields(req, res) {
  try {
    const data = await orgService.listCustomFieldDefinitions(req.user);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Error in listCustomFields:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function createCustomField(req, res) {
  try {
    const data = await orgService.createCustomFieldDefinition(req.user, req.body);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('Error in createCustomField:', err);
    return res.status(400).json({ success: false, message: err.message });
  }
}

async function updateCustomField(req, res) {
  try {
    const id = req.params.id;
    const data = await orgService.updateCustomFieldDefinition(req.user, id, req.body);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Error in updateCustomField:', err);
    return res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteCustomField(req, res) {
  try {
    const id = req.params.id;
    await orgService.deleteCustomFieldDefinition(req.user, id);
    return res.json({ success: true, message: "Custom field deleted successfully" });
  } catch (err) {
    console.error('Error in deleteCustomField:', err);
    return res.status(400).json({ success: false, message: err.message });
  }
}

async function listCustomUnits(req, res) {
  try {
    const data = await orgService.getCustomUnits(req.user);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function addCustomUnit(req, res) {
  try {
    const data = await orgService.addCustomUnit(req.user, req.body.unit);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteCustomUnit(req, res) {
  try {
    const data = await orgService.deleteCustomUnit(req.user, req.params.unit);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

module.exports = {
  getMyOrganization,
  updateMyOrganization,
  uploadLogo,
  getLogo,
  deleteLogo,
  listCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  listCustomUnits,
  addCustomUnit,
  deleteCustomUnit,
};
