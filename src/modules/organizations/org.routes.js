const router = require("express").Router();
const auth = require("../../middlewares/auth.middleware");
const orgController = require("./org.controller");

router.get("/me", auth, orgController.getMyOrganization);
router.put("/me", auth, orgController.updateMyOrganization);

module.exports = router;
