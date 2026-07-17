const Joi = require('joi');

const createProposalSchema = Joi.object({
  stock_code: Joi.string().trim().max(20).required(),
  order_type: Joi.string().valid('BUY', 'SELL').required(),
  quantity: Joi.number().integer().min(1).required(),
  target_price: Joi.number().positive().required(),
  rationale: Joi.string().trim().max(5000).required(),
  market_analysis: Joi.string().trim().max(5000).allow('', null),
  risk_analysis: Joi.string().trim().max(5000).allow('', null),
});

const listProposalsSchema = Joi.object({
  status: Joi.string().valid('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED').allow('', null),
});

const voteSchema = Joi.object({
  is_approved: Joi.boolean().required(),
});

module.exports = { createProposalSchema, listProposalsSchema, voteSchema };
