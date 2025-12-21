// src/routes/index.js
const express = require('express');
const router = express.Router();
// Module routes
const authRoutes = require('../modules/auth/auth.routes');
const userRoutes = require('../modules/users/user.routes');
// const orgRoutes = require('../modules/organizations/org.routes');
const invoiceRoutes = require('../modules/invoices/invoice.routes');
// const expenseRoutes = require('../modules/expenses/expense.routes');
// const dashboardRoutes = require('../modules/dashboard/dashboard.routes');
// const aiRoutes = require('../modules/ai/ai.routes');

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'Numor API is healthy 🚀' });
});

// Mount modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
// router.use('/organizations', orgRoutes);
router.use('/invoices', invoiceRoutes);
// router.use('/expenses', expenseRoutes);
// router.use('/dashboard', dashboardRoutes);
// router.use('/ai', aiRoutes);

module.exports = router;
