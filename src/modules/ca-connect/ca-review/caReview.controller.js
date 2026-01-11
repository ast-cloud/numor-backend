const caReviewService = require('./caReview.service');

/**
 * Create CA Review (Customer)
 */
exports.createReview = async (req, res, next) => {
  try {
    const review = await caReviewService.createReview(
      req.user,
      req.body
    );

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: review
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get reviews for CA profile (Public)
 */
exports.getReviewsForCA = async (req, res, next) => {
  try {
    const { caProfileId } = req.params;

    const reviews = await caReviewService.getReviewsForCA(
      BigInt(caProfileId)
    );

    res.json({
      success: true,
      data: reviews
    });
  } catch (err) {
    next(err);
  }
};
