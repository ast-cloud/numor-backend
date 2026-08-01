const adminService = require("./admin.service");


exports.approveCAProfileUpdate = async (req, res, next) => {
  try {
    const { caProfileId } = req.params;

    const result = await adminService.approveCAProfileUpdate(caProfileId);

    res.status(200).json({
      success: true,
      message: "CA profile update approved successfully",
      data: result
    });

  } catch (err) {
    next(err);
  }
};

exports.rejectCAProfileUpdate = async (req, res, next) => {
  try {
    const { caProfileId } = req.params; 
    const result = await adminService.rejectCAProfileUpdate(caProfileId);

    res.status(200).json({
      success: true,
      message: "CA profile update rejected successfully",
      data: result
    });

  } catch (err) {
    next(err);
  }
};

exports.listPendingCARequest = async (req, res, next) => {
  try {
    const pendingRequests = await adminService.listPendingCARequest();
    res.status(200).json({
      success: true,
      data: pendingRequests
    });
  } catch (err) {
    next(err);
  }
};

exports.getPendingRequestDetails = async (req, res, next) => {
  try {
    const { pendingId } = req.params;
    const details = await adminService.getPendingRequestDetails(pendingId);
    res.status(200).json({
      success: true,
      data: details
    });
  } catch (err) {
    next(err);
  }
};

exports.listRequestsByStatus = async (req, res, next) => {
  try {
    const { status } = req.query;
    const requests = await adminService.listRequestsByStatus(status);
    res.status(200).json({
      success: true,
      data: requests
    });
  } catch (err) {
    next(err);
  }
};

exports.getPendingCAs = async (req, res, next) => {
  try {
    const pendingCAs = await adminService.getPendingCAs();
    res.status(200).json({
      success: true,
      data: pendingCAs
    });
  } catch (err) {
    next(err);
  }
};

exports.getCAForReview = async (req, res, next) => {
  try {
    const { caId } = req.params;
    const caDetails = await adminService.getCAForReview(caId);
    res.status(200).json({
      success: true,
      data: caDetails
    });
  } catch (err) {
    next(err);
  }
}

exports.approveCAProfile = async (req, res, next) => {
  try {
    const { caId } = req.params;
    const result = await adminService.approveCAProfile(caId);
    res.status(200).json({
      success: true,
      message: "CA profile approved successfully",
      data: result
    });
  } catch (err) {
    next(err);
  }
};

exports.rejectCAProfile = async (req, res, next) => {
  try {
    const { caId, comment } = req.params;
    const result = await adminService.rejectCAProfile(caId, comment);
    res.status(200).json({
      success: true,
        message: "CA profile rejected successfully",
        data: result
    });
  } catch (err) {
    next(err);
  }
}

exports.getMarketplaceCAs = async (req, res, next) => {
  try {
    const cas = await adminService.getMarketplaceCAs();
    res.status(200).json({
      success: true,
      data: cas
    });
  } catch (err) {
    next(err);
    }
}

exports.getProfileComparison = async (req, res, next) => {
  try {
    const caId = req.params.caId;
    const result = await adminService.getProfileComparison(req.loggedInUser, caId);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    next(error);
  }
};

exports.getCAProfileCounts = async (req, res, next) => {
  try {
    const counts = await adminService.getCAProfileCounts();
    res.status(200).json({
      success: true,
      data: counts
    });
  } catch (err) {
    next(err);
  }
}

exports.listCAProfiles = async (req, res, next) => {
  try {
    const { tab = 'underReview', page = 1, limit = 20 } = req.query;
    const result = await adminService.listCAProfiles(tab, page, limit);
    res.status(200).json({
      success: true,
      data: result
    });
  }
    catch (err) {
    next(err);
  }
}

exports.suspendCAProfile = async (req, res, next) => {
  try {
    const { caProfileId } = req.params;
    const { comment } = req.body;
    const result = await adminService.suspendCAProfile(caProfileId, comment);
    res.status(200).json({
      success: true,
      message: "CA profile suspended successfully"
    });
  } catch (err) {
    next(err);
  }
}