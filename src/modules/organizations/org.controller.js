const orgService = require("./org.service");

async function getMyOrganization(req, res) {
  const org = await orgService.getById(req.loggedInUser.orgId);

  res.json({
    success: true,
    data: org,
  });
}

async function updateMyOrganization(req, res) {
  const org = await orgService.update(
    req.loggedInUser.orgId,
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
    const user = req.loggedInUser;
    const file = req.file;
    const logoUrl = await orgService.uploadLogo(user, file);
    res.json({ success: true, logoUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

async function getLogo(req, res, next) {
  try {
    const user = req.loggedInUser;
    const logoUrl = await orgService.getLogo(user);
    res.json({ success: true, logoUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function deleteLogo(req, res, next) {
  try {
    const user = req.loggedInUser;
    await orgService.deleteLogo(user);
    res.json({ success: true, message: "Logo deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function listCustomFields(req, res) {
  try {
    const data = await orgService.listCustomFieldDefinitions(req.loggedInUser);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Error in listCustomFields:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function createCustomField(req, res) {
  try {
    const data = await orgService.createCustomFieldDefinition(req.loggedInUser, req.body);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('Error in createCustomField:', err);
    return res.status(400).json({ success: false, message: err.message });
  }
}

async function updateCustomField(req, res) {
  try {
    const id = req.params.id;
    const data = await orgService.updateCustomFieldDefinition(req.loggedInUser, id, req.body);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Error in updateCustomField:', err);
    return res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteCustomField(req, res) {
  try {
    const id = req.params.id;
    await orgService.deleteCustomFieldDefinition(req.loggedInUser, id);
    return res.json({ success: true, message: "Custom field deleted successfully" });
  } catch (err) {
    console.error('Error in deleteCustomField:', err);
    return res.status(400).json({ success: false, message: err.message });
  }
}

async function listCustomUnitsInvoice(req, res) {
  try {
    const data = await orgService.getCustomUnitsInvoice(req.loggedInUser);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function addCustomUnitInvoice(req, res) {
  try {
    const data = await orgService.addCustomUnitInvoice(req.loggedInUser, req.body.unit);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteCustomUnitInvoice(req, res) {
  try {
    const data = await orgService.deleteCustomUnitInvoice(req.loggedInUser, req.params.unit);
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
  listCustomUnitsInvoice,
  addCustomUnitInvoice,
  deleteCustomUnitInvoice,
};
