const { appLogger } = require("../utils/logger");

module.exports = (req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;

    appLogger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      userId: req.loggedInUser?.userId,
    });
  });

  next();
};
