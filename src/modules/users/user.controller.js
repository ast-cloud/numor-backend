const service = require('./user.service');

exports.createUser = async (req, res, next) => {
    try{
        const result = await service.createUser(req.loggedInUser, req.body);
        res.status(201).json({success: true, data: result});
    }
    catch(err){
        next(err);
    }
};

exports.listUsers = async (req, res, next) => {
    try {
        const {page, limit} = req.query;
        const users = await service.listUsers(req.loggedInUser, Number(page), Number(limit));
        res.json({ success: true, data: users });
    } catch (err) {
        next(err);
    }
};

exports.getUser = async (req, res, next) => {
    try {
        const user = await service.getUser(req.loggedInUser, req.params.id);
        res.json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
};

exports.updateUser = async (req, res, next) => {
    try {
        const user = req.loggedInUser;
        const userresponse = await service.updateUser(user, req.body);
        res.json({ success: true, data: userresponse });
    } catch (err) {
        next(err);
    }
};

exports.updateUserStatus = async (req, res, next) => {
    try {
        const user = await service.updateUserStatus(
            req.loggedInUser,
            req.params.id,
            req.body.isActive
        );
        res.json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
};

exports.getCurrentUser = async (req, res, next) => {
    console.log('Fetching current user for:', req.loggedInUser);
    try {
        const user = await service.getUser(req.loggedInUser, req.loggedInUser.userId);
        res.json({ success: true, data: user });
    } catch (err) {
        next(err);
    }

};

exports.uploadProfilePhoto = async (req, res, next) => {
  try {
    const user = req.loggedInUser;
    const file = req.file;
    const profilePhotoUrl = await service.uploadProfilePhoto(user, file);
    res.json({ success: true, profilePhotoUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getProfilePhoto = async (req, res, next) => {
  try {
    const user = req.loggedInUser;
    const photoUrl = await service.getProfilePhoto(user);
    res.json({ success: true, photoUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

exports.deleteProfilePhoto = async (req, res, next) => {
  try {
    const user = req.loggedInUser;
    await service.deleteProfilePhoto(user);
    res.json({ success: true, message: "Profile photo deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

exports.inviteNewUser = async (req, res, next) => {

  const { email, organizationId, permissions } = req.body;

  if (!email || !organizationId || !permissions) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const result = await service.inviteNewUser(email, organizationId, permissions);
    res.json({ success: result.success, message: result.message });
  } catch (err) {
    next(err);
  }


}

exports.invitations = async (req, res, next) => {
  try {
    const invitations = await service.listInvitations(req.loggedInUser.orgId);

    res.json({
      success: true,
      data: invitations,
    });
  } catch (err) {
    next(err);
  }
};

exports.subAccounts = async (req, res, next) => {
  try {
    const users = await service.listSubAccounts(req.loggedInUser.orgId);

    res.json({
      success: true,
      data: users,
    });
  } catch (err) {
    next(err);
  }
};

exports.updatePermissions = async (req, res, next) => {
  try {
    const updatedUser = await service.updateSubAccountPermissions(
      req.loggedInUser,
      req.params.userId,
      req.body.permissions
    );

    res.json({
      success: true,
      message: "Permissions updated successfully",
      data: updatedUser
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteSubAccount = async (req, res, next) => {
  try {
    const result = await service.deleteSubAccount(
      req.loggedInUser,
      req.params.userId
    );

    res.json({
      success: true,
      message: "Sub-account deleted successfully",
    });
  } catch (err) {
    next(err);
  }
};


exports.saveWidgets = async (req, res, next) => {
  try {
    const userId = req.loggedInUser.userId;
    const { widgets } = req.body;

    const data = await service.saveWidgets(userId, widgets);

    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
};


exports.deleteWidget = async (req, res, next) => {
  try {
    const userId = req.loggedInUser.userId;
    const widgetName = req.query.widgetName || req.query.name || req.query.widgetId;

    console.log('Deleting widget for user:', userId, 'Widget name:', widgetName);

    const data = await service.deleteWidget(userId, widgetName);

    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
};
