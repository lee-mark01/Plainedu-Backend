const express = require('express');
const router = express.Router();
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');

const portfolioController = require('./portfolio.controller');
const { createPortfolioSchema, updatePortfolioSchema, voteSchema } = require('./portfolio.validator');

const tradeProposalController = require('./tradeProposal.controller');
const {
  createProposalSchema,
  listProposalsSchema,
  voteSchema: proposalVoteSchema,
} = require('./tradeProposal.validator');

// ── 매매 제안 (Trade Proposals) — /:id 보다 위에 위치해야 함 ──

router.get('/trade-proposals', authenticate, validate(listProposalsSchema, 'query'), tradeProposalController.listProposals);
router.post('/trade-proposals', authenticate, validate(createProposalSchema), tradeProposalController.createProposal);
router.get('/trade-proposals/:id', authenticate, tradeProposalController.getProposalDetail);
router.post('/trade-proposals/:id/votes', authenticate, validate(proposalVoteSchema), tradeProposalController.vote);

// ── 모델포트폴리오 (MP) ──

router.get('/', authenticate, portfolioController.listPortfolios);
router.get('/active', authenticate, portfolioController.getActivePortfolio);
router.post('/', authenticate, validate(createPortfolioSchema), portfolioController.createPortfolio);
router.get('/:id', authenticate, portfolioController.getPortfolioDetail);
router.put('/:id', authenticate, validate(updatePortfolioSchema), portfolioController.updatePortfolio);
router.delete('/:id', authenticate, portfolioController.deletePortfolio);
router.post('/:id/submit', authenticate, portfolioController.submitPortfolio);
router.post('/:id/votes', authenticate, validate(voteSchema), portfolioController.vote);
router.get('/:id/votes', authenticate, portfolioController.getVotes);

module.exports = router;
