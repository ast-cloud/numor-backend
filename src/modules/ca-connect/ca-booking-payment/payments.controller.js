const { FRONTEND_URL } = require("../../../config/env");

exports.phonepeRedirect = async (req, res) => {
  const { merchantOrderId, code } = req.body;

  // Do NOT trust redirect result fully
  // Always verify via status API or webhook

  return res.redirect(
    `${FRONTEND_URL}/payment-status?orderId=${merchantOrderId}`
  );
};
