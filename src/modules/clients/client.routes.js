const router = require('express').Router();
const auth = require('../../middlewares/auth.middleware');
const controller = require('./client.controller');

router.post(
  '/createClient',
  auth,
  controller.createClient
);

router.get(
  '/',
  auth,
  controller.listClients
)

router.get(
  '/:id/getClient',
  auth,
  controller.getClient
)

router.put(
  '/:clientId/updateClient',
  auth,
  controller.updateClient
);

router.delete(
  '/:clientId/deleteClient',
  auth,
  controller.deleteClient
);


module.exports = router;
