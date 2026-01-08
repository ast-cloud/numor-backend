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
    const user = req.user;
    const profile = await caProfileService.getByUserId(user);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
};

exports.createCAProfile = async (req, res, next) => {
  try {
    const user = req.user;
    const payload = req.body;
    const profile = await caProfileService.createProfile(user, payload);
    res.status(201).json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
};

exports.updateCAProfile = async (req, res, next) => {
  try {
    const user = req.user;
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
    const user = req.user;
    await caProfileService.deleteProfile(user);
    res.json({ success: true, message: 'CA profile deleted' });
  } catch (err) {
    next(err);
  }
};
