const { FF_CA_CORE, FF_AI_CHATBOT, FF_CHAT_GRAPH } = require("./env");

const normalizeBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  return value.toString().toLowerCase() === 'true' || value === true;
};

const FLAGS = {
  FF_CA_CORE: normalizeBoolean(FF_CA_CORE, false),
  FF_AI_CHATBOT: normalizeBoolean(FF_AI_CHATBOT, false),
  FF_CHAT_GRAPH: normalizeBoolean(FF_CHAT_GRAPH, false),
};

function isFeatureEnabled(flagName) {
  const flagValue = FLAGS[flagName];
  console.log(`Feature Flag "${flagName}": ${flagValue}`);
  return Boolean(FLAGS[flagName]);
}

module.exports = {
  FLAGS,
  isFeatureEnabled,
};
