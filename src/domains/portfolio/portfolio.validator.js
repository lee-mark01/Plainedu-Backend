const Joi = require('joi');

const allocationSchema = Joi.object({
  stock_code: Joi.string().trim().max(20).required(),
  target_percentage: Joi.number().min(0).max(100).required(),
  reason: Joi.string().trim().max(2000).allow('', null),
});

const createPortfolioSchema = Joi.object({
  type: Joi.string().valid('NEW', 'REVISION').default('NEW'),
  parent_id: Joi.number().integer().allow(null),
  title: Joi.string().trim().max(100).allow('', null),
  description: Joi.string().trim().max(5000).allow('', null),
  analysis: Joi.string().trim().max(5000).allow('', null),
  allocations: Joi.array().items(allocationSchema).min(0).default([]),
  status: Joi.string().valid('DRAFT', 'PENDING').default('DRAFT'),
});

const updatePortfolioSchema = Joi.object({
  title: Joi.string().trim().max(100).allow('', null),
  description: Joi.string().trim().max(5000).allow('', null),
  analysis: Joi.string().trim().max(5000).allow('', null),
  allocations: Joi.array().items(allocationSchema).min(0),
});

const voteSchema = Joi.object({
  is_approved: Joi.boolean().required(),
});

module.exports = { createPortfolioSchema, updatePortfolioSchema, voteSchema };
