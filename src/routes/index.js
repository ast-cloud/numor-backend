// src/routes/index.js
const express = require('express');
const router = express.Router();
const requireFeature = require('../middlewares/featureFlag.middleware');
// Module routes
const authRoutes = require('../modules/auth/auth.routes');
const userRoutes = require('../modules/users/user.routes');
const orgRoutes = require('../modules/organizations/org.routes');
const invoiceRoutes = require('../modules/invoices/invoice.routes');
const expenseRoutes = require('../modules/expenses/expense.routes');
const dashboardRoutes = require('../modules/dashboard/dashboard.routes');
const clientRoutes = require('../modules/clients/client.routes');
const configRoutes = require('../modules/config/config.routes');
// const aiRoutes = require('../modules/ai/ai.routes');

const caProfile = require('../modules/ca-connect/ca-profile/caProfile.routes');
const caReview = require('../modules/ca-connect/ca-review/caReview.routes');
// const caAdmin = require('../modules/ca-connect/admin/caAdmin.routes');
const caSlots = require('../modules/ca-connect/ca-slots-and-bookings/caSlot.routes');
const chatBot = require("../modules/ai/chatbot/chat.route");
const qstashRoute = require("../workers/qstash.route");
const adminRoutes = require("../modules/admin/admin.routes");

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'Numor API is healthy 🚀' });
});

// Mount modules
router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/organization', orgRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/expenses', expenseRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/clients', clientRoutes);
router.use('/config', configRoutes);
// router.use('/ai', aiRoutes);

// CA Connect routes
router.use('/ca-profile', requireFeature('CA_CORE'), caProfile);
router.use('/ca-reviews', requireFeature('CA_CORE'), caReview);
// router.use('/ca/admin', caAdmin);
router.use('/ca-slots', requireFeature('CA_CORE'), caSlots);
router.use('/chatbot', requireFeature('AI_CHATBOT'), chatBot);
router.use('/qstash', qstashRoute);
// Admin portal is excluded from feature-flag gating
router.use('/admin', adminRoutes);

module.exports = router;
