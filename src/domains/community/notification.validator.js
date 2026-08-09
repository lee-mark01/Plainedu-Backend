const Joi = require('joi');

const getNotificationsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20)
});

module.exports = { getNotificationsSchema };
