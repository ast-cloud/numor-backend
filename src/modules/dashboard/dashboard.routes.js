const router = require('express').Router();
const auth = require('../../middlewares/auth.middleware');
const controller = require('./dashboard.controller');

router.get(
  '/userRevenue',
  auth,
  controller.userRevenue
)
router.get(
  '/userExpense',
  auth,
  controller.userExpense
)

router.get(
  '/dashboardSummary',
  auth,
  controller.dashboardSummary
)

router.get(
  '/dashboardSummary',
  auth,
  controller.dashboardSummary
)

router.get(
  '/revenueExpenseTrend',
  auth,
  controller.revenueExpenseTrend
)

module.exports = router;
