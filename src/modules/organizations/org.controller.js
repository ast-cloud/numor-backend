const { ZodError } = require("zod");
const orgService = require("./org.service");
const {
  paymentAccountSchema,
  paymentAccountIdParamSchema,
  formatZodError,
} = require("./org.validator");

/** Single error exit: ZodError -> 400 with field names, anything else -> status. */
const fail = (res, err, context, status = 400) => {
  if (err instanceof ZodError) {
    return res.status(400).json(formatZodError(err));
  }

  console.error(`Error in ${context}:`, err);
  return res.status(status).json({ success: false, message: err.message });
};

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

async function getInvoiceUnits(req, res) {
  try {
    const data = await orgService.getInvoiceUnits(req.loggedInUser);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('Error in getInvoiceUnits:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function setActiveUnitsInvoice(req, res) {
  try {
    const data = await orgService.setActiveUnitsInvoice(req.loggedInUser, req.body.units);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}


// Saved bank/payment detail sets, offered as a dropdown in the invoice dialog.

async function listPaymentAccounts(req, res) {
  try {
    const data = await orgService.listPaymentAccounts(req.loggedInUser);
    return res.json({ success: true, data });
  } catch (err) {
    return fail(res, err, "listPaymentAccounts", 500);
  }
}

async function createPaymentAccount(req, res) {
  try {
    const payload = paymentAccountSchema.parse(req.body);

    const data = await orgService.createPaymentAccount(req.loggedInUser, payload);

    return res.status(201).json({ success: true, data });
  } catch (err) {
    return fail(res, err, "createPaymentAccount");
  }
}

async function updatePaymentAccount(req, res) {
  try {
    const { id } = paymentAccountIdParamSchema.parse(req.params);
    const payload = paymentAccountSchema.parse(req.body);

    const data = await orgService.updatePaymentAccount(req.loggedInUser, id, payload);

    return res.json({ success: true, data });
  } catch (err) {
    return fail(res, err, "updatePaymentAccount");
  }
}

async function deletePaymentAccount(req, res) {
  try {
    const { id } = paymentAccountIdParamSchema.parse(req.params);

    await orgService.deletePaymentAccount(req.loggedInUser, id);

    return res.json({ success: true, message: "Payment details deleted successfully" });
  } catch (err) {
    return fail(res, err, "deletePaymentAccount");
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
  listPaymentAccounts,
  createPaymentAccount,
  updatePaymentAccount,
  deletePaymentAccount,
  getInvoiceUnits,
  setActiveUnitsInvoice,
};
