// src/routes/index.js
const express = require('express');
const router = express.Router();
// Module routes
const authRoutes = require('../modules/auth/auth.routes');
const userRoutes = require('../modules/users/user.routes');
const orgRoutes = require('../modules/organizations/org.routes');
const invoiceRoutes = require('../modules/invoices/invoice.routes');
const expenseRoutes = require('../modules/expenses/expense.routes');
const dashboardRoutes = require('../modules/dashboard/dashboard.routes');
const clientRoutes = require('../modules/clients/client.routes');
// const aiRoutes = require('../modules/ai/ai.routes');

const caProfile = require('../modules/ca-connect/ca-profile/caProfile.routes');
// const caBooking = require('../modules/ca-connect/booking/caBooking.routes');
// const caReview = require('../modules/ca-connect/review/caReview.routes');
// const caAdmin = require('../modules/ca-connect/admin/caAdmin.routes');

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'Numor API is healthy 🚀' });
});

// Mount modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/organizations', orgRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/expenses', expenseRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/clients', clientRoutes);
// router.use('/ai', aiRoutes);

// CA Connect routes
router.use('/ca-profile', caProfile);
// router.use('/ca/bookings', caBooking);
// router.use('/ca/reviews', caReview);
// router.use('/ca/admin', caAdmin);

module.exports = router;
