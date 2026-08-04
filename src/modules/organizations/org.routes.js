const router = require("express").Router();
const auth = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const orgController = require("./org.controller");
const { caUpload } = require('../../config/upload');

router.get("/me", auth, requirePermission("organizationSettings", "read"), orgController.getMyOrganization);
router.put("/update", auth, requirePermission("organizationSettings", "write"), orgController.updateMyOrganization);
router.post('/logo', auth, requirePermission("organizationSettings", "write"), caUpload.single("file"), orgController.uploadLogo);
router.get('/logo', auth, requirePermission("organizationSettings", "read"), orgController.getLogo);
router.delete('/logo', auth, requirePermission("organizationSettings", "write"), orgController.deleteLogo);

router.get('/custom-fields', auth, requirePermission("organizationSettings", "read"), orgController.listCustomFields);
router.post('/custom-fields', auth, requirePermission("organizationSettings", "write"), orgController.createCustomField);
router.put('/custom-fields/:id', auth, requirePermission("organizationSettings", "write"), orgController.updateCustomField);
router.delete('/custom-fields/:id', auth, requirePermission("organizationSettings", "write"), orgController.deleteCustomField);

router.get('/custom-units',          auth, requirePermission("organizationSettings", "read"),  orgController.listCustomUnitsInvoice);
router.post('/custom-units',         auth, requirePermission("organizationSettings", "write"), orgController.addCustomUnitInvoice);
router.delete('/custom-units/:unit', auth, requirePermission("organizationSettings", "write"), orgController.deleteCustomUnitInvoice);

router.get('/invoice-units',        auth, requirePermission("organizationSettings", "read"),  orgController.getInvoiceUnits);
router.put('/invoice-units/active', auth, requirePermission("organizationSettings", "write"), orgController.setActiveUnitsInvoice);

module.exports = router;
