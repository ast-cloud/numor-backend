const service = require('./caSlot.service');

exports.createSlots = async (req, res) => {
  const user = req.user;
  const data = req.body;

  const slots = await service.createSlots(user, data);
  res.json({ success: true, slots });
};

exports.getSlotsByDate = async (req, res) => {
  const { caProfileId } = req.params;
  const { date } = req.query;

  const slots = await service.getSlots(caProfileId, date);
  res.json(slots);
};

exports.blockSlot = async (req, res) => {
  const { slotId } = req.params;
  const caProfileId = req.user.caProfileId;

  await service.blockSlot(slotId, caProfileId);
  res.json({ success: true });
};
