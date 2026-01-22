const router = require('express').Router();
const auth = require('../../middlewares/auth.middleware');
const allowRoles = require('../../middlewares/role.middleware');
const validate = require('../../middlewares/validate.middleware');

const controller = require('./user.controller');
const validator = require('./user.validator');


router.use(auth);

router.get('/me', controller.getCurrentUser);

// router.use(allowRoles('ADMIN'));

// router.post('/', validate(validator.createUserSchema), controller.createUser);
// // router.get('/', controller.listUsers);
// router.get('/:id', controller.getUser);
router.put('/update', validate(validator.updateUserSchema), controller.updateUser);
router.patch(
    '/:id/status',
    validate(validator.updateStatusSchema),
    controller.updateUserStatus
);

module.exports = router;