const router = require('express').Router();
const authenticate = require('../../../middlewares/auth.middleware');
const controller = require('./caProfile.controller');
const role = require('../../../middlewares/role.middleware');

router.get(
    '/', 
    authenticate, 
    controller.listCAs);

router.get(
    '/me', 
    authenticate,
    role('CA_USER'), 
    controller.getCAProfile);

router.post(
    '/', 
    authenticate,
    role('CA_USER'), 
    controller.createCAProfile);

router.put(
    '/', 
    authenticate,
    role('CA_USER'), 
    controller.updateCAProfile);

router.delete(
    '/', 
    authenticate, 
    role('CA_USER'),
    controller.deleteCAProfile);

module.exports = router;