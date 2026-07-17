const tradeProposalService = require('./tradeProposal.service');

const listProposals = async (req, res, next) => {
  try {
    const data = await tradeProposalService.listProposals(req.user.userId, req.validated || {});
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getProposalDetail = async (req, res, next) => {
  try {
    const data = await tradeProposalService.getProposalDetail(req.user.userId, Number(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const createProposal = async (req, res, next) => {
  try {
    const data = await tradeProposalService.createProposal(req.user.userId, req.validated);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const vote = async (req, res, next) => {
  try {
    const data = await tradeProposalService.vote(req.user.userId, Number(req.params.id), req.validated.is_approved);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { listProposals, getProposalDetail, createProposal, vote };
