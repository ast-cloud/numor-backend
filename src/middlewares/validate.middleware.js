module.exports = (schema) => (req, res, next) => {
    try {
        schema.parse(req.body);
        next();
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.errors?.[0]?.message || 'Invalid input',
        });
    }
};
