const service = require('./user.service');

exports.createUser = async (req, res, next) => {
    try{
        const result = await service.createUser(req.user, req.body);
        res.status(201).json({success: true, data: result});
    }
    catch(err){
        next(err);
    }
};

exports.listUsers = async (req, res, next) => {
    try {
        const {page, limit} = req.query;
        const users = await service.listUsers(req.user, Number(page), Number(limit));
        res.json({ success: true, data: users });
    } catch (err) {
        next(err);
    }
};

exports.getUser = async (req, res, next) => {
    try {
        const user = await service.getUser(req.user, req.params.id);
        res.json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
};

exports.updateUser = async (req, res, next) => {
    try {
        const user = await service.updateUser(
            req.user,
            req.params.id,
            req.body
        );
        res.json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
};

exports.updateUserStatus = async (req, res, next) => {
    try {
        const user = await service.updateUserStatus(
            req.user,
            req.params.id,
            req.body.isActive
        );
        res.json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
};