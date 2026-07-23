// 팀 트레이더 작업공간 — 실행 대기열(TO-01) / 주문 실행(TO-02) / 체결·이력(TO-03) / 권한 통제(TO-04)
const AppError = require('../../errors/AppError');
const tradingService = require('./trading.service');
const tradingRepository = require('./trading.repository');
const userRepository = require('../user/user.repository');
const teamRepository = require('../team/team.repository');
const { requireTeamMembership } = require('../team/team.service');
const accountService = require('../account/account.service');
const tradeProposalRepository = require('../portfolio/tradeProposal.repository');
const portfolioService = require('../portfolio/portfolio.service');

// TO-04: 팀 소속 + Trader 포지션만 팀 주문을 실행할 수 있다.
const requireTraderPosition = async (userId) => {
  const membership = await requireTeamMembership(userId);

  const user = await userRepository.findById(userId);
  if (user.position !== 'TRADER') {
    throw new AppError('주문 실행은 Trader만 가능합니다.', 403, 'TRADER_ONLY');
  }
  return membership;
};

// TO-01: 가결된 제안 목록 + Active MP 대비 현재 비중 괴리
const getExecutionQueue = async (userId) => {
  const membership = await requireTeamMembership(userId);

  const proposals = await tradeProposalRepository.findByTeamId(membership.team_id, 'APPROVED');

  // Active MP가 아직 없는 팀도 있을 수 있음 — 그 경우 비중 괴리 없이 제안 목록만 반환 (에러 아님)
  let alignmentByStock = new Map();
  try {
    const active = await portfolioService.getActivePortfolio(userId);
    alignmentByStock = new Map(active.alignment_items.map((item) => [item.stock_code, item]));
  } catch (err) {
    if (!(err instanceof AppError) || err.status !== 404) throw err;
  }

  return proposals.map((p) => ({
    ...p,
    current_alignment: alignmentByStock.get(p.stock_code) || null,
  }));
};

// TO-02: 팀 계좌 주문 실행. proposal_id가 있으면 APPROVED인지만 확인(느슨한 참조 — 내용 일치는 강제 안 함).
const placeTeamOrder = async (userId, { proposal_id, ...orderParams }) => {
  const membership = await requireTraderPosition(userId);

  if (proposal_id) {
    const proposal = await tradeProposalRepository.findById(proposal_id);
    if (!proposal) throw new AppError('매매 제안을 찾을 수 없습니다.', 404);
    if (proposal.team_id !== membership.team_id) {
      throw new AppError('같은 팀의 제안만 참조할 수 있습니다.', 403);
    }
    if (proposal.status !== 'APPROVED') {
      throw new AppError('가결된 제안만 실행할 수 있습니다.', 400, 'PROPOSAL_NOT_APPROVED');
    }
  }

  const team = await teamRepository.findById(membership.team_id);
  const teamAccount = await accountService.getOrCreateTeamAccount(membership.team_id, team.school_id);

  return tradingService.executeOrderPlacement(teamAccount, userId, { ...orderParams, proposal_id: proposal_id || null });
};

// TO-03: 팀 주문 내역
const listTeamOrders = async (userId, { status, page, limit }) => {
  const membership = await requireTeamMembership(userId);

  const team = await teamRepository.findById(membership.team_id);
  const account = await accountService.getOrCreateTeamAccount(membership.team_id, team.school_id);

  return tradingRepository.listOrdersByAccount(account.id, { status, page, limit });
};

module.exports = { getExecutionQueue, placeTeamOrder, listTeamOrders };
