const express = require('express');
const router = express.Router();

const caReviewController = require('./caReview.controller');
const authenticate = require('../../../middlewares/auth.middleware');
const role = require('../../../middlewares/role.middleware');

/**
 * Customer creates review for completed booking
 * POST /api/ca-reviews
 */
router.post(
    '/',
    authenticate,
    role('CA'),
    caReviewController.createReview
);

/**
 * Public: Get reviews for CA profile
 * GET /api/ca-reviews/ca/:caProfileId
 */
router.get(
    '/:caProfileId',
    authenticate,
    caReviewController.getReviewsForCA
);

module.exports = router;
