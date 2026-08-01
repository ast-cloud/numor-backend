const { ca, fi } = require('zod/v4/locales');
const caProfileService = require('./caProfile.service');

exports.listCAs = async (req, res, next) => {
  try {
    const cas = await caProfileService.listApprovedCAs(req.query);
    res.json({ success: true, data: cas });
  } catch (err) {
    next(err);
  }
};

exports.getCAProfile = async (req, res, next) => {
  try {
    const user = req.loggedInUser;
    const profile = await caProfileService.getByUserId(user);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
};

exports.createCAProfile = async (req, res, next) => {
  try {
    const user = req.loggedInUser;
    const payload = req.body;
    const profile = await caProfileService.createProfile(user, payload);
    res.status(201).json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
};

exports.updateCAProfile = async (req, res, next) => {
  try {
    const user = req.loggedInUser;
    const payload = req.body;
    const profile = await caProfileService.updateProfile(
      user, payload
    );
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
};

exports.deleteCAProfile = async (req, res, next) => {
  try {
    const user = req.loggedInUser;
    await caProfileService.deleteProfile(user);
    res.json({ success: true, message: 'CA profile deleted' });
  } catch (err) {
    next(err);
  }
};

exports.uploadDocument = async (req, res) => {
  try {
    const user = req.loggedInUser;
    const file = req.file;
    const { type, description } = req.body;

    if (!file) {
      return res.status(400).json({ message: "File is required" });
    }
    if (!type) {
      return res.status(400).json({ message: "Type is required" });
    }
    if (!description) {
      return res.status(400).json({ message: "Name of document is required" });
    }
    const result = await caProfileService.uploadDocument(user, file, type, description || ""); // Pass description or empty string if not provided
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDocuments = async (req, res) => {
  try {

    const user = req.loggedInUser;

    const data = await caProfileService.getDocuments(user);

    res.json({
      success: true,
      data
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteDocument = async (req, res, next) => {
  try {
    const { fileKey } = req.query;
    const result = await caProfileService.deleteDocument(
      req.loggedInUser,
      fileKey
    );

    res.json({
      success: true,
      data: result
    });

  } catch (err) {
    next(err);
  }
};

exports.submitPendingProfile = async (req, res, next) => {
  try {
    const result = await caProfileService.submitPendingProfile(req.loggedInUser);

    res.json({
      success: true,
      message: "Profile submitted for review",
      data: result
    });

  } catch (error) {
    next(error);
  }
};

// exports.uploadCertificate = async (req, res, next) => {
//     try {
//       const user = req.loggedInUser;
//       const file = req.file;
//       const certUrl = await caProfileService.uploadCertificate(user, file);
//       res.json({ success: true, data: { certUrl } });
//     } catch (err) {
//       next(err);
//     }
// }

// exports.uploadIdProof = async (req, res, next) => {
//   try{
//     const user = req.loggedInUser;
//     const file = req.file;
//     const idProofUrl = await caProfileService.uploadIdProof(user, file);
//     res.json({ success: true, data: { idProofUrl } });  
//   } catch (err) {
//     next(err);
//   }
// }
