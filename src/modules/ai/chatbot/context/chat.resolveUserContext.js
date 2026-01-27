const buildBaseContext = require('./chat.base.context');
const smeContext = require('./chat.smeUser.context');
const caContext = require('./chat.caUser.Context');

async function resolveUserContext(user) {
  const baseContext = buildBaseContext(user);

  // SME data
  const smeData = await smeContext(user);

  // CA data (if available)
  let caData = {};
  if (user.role === 'CA_USER') {
    caData = await caContext(user);
  }

  return {
    baseContext,
    roleContext: {
      sme: smeData,
      ca: caData
    },
  };
}

module.exports = { resolveUserContext };
