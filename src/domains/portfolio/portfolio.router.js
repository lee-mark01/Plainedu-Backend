const express = require('express');
const router = express.Router();
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');

const portfolioController = require('./portfolio.controller');
const { createPortfolioSchema, updatePortfolioSchema, voteSchema } = require('./portfolio.validator');

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
