// 팀 트레이더 작업공간 — 주문 실행(TO-02) / 체결·이력(TO-03) / 권한 통제(TO-04)
const AppError = require('../../errors/AppError');
const tradingService = require('./trading.service');
const tradingRepository = require('./trading.repository');
const teamRepository = require('../team/team.repository');
const userRepository = require('../user/user.repository');
const { requireTeamMembership } = require('../team/team.service');
const accountService = require('../account/account.service');
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

// TO-01: Active MP 대비 현재 비중 괴리 (Alignment) 조회 — Trader가 어떤 주문을 넣어야 하는지 판단하는 근거
const getExecutionQueue = async (userId) => {
  const membership = await requireTeamMembership(userId);

  try {
    const active = await portfolioService.getActivePortfolio(userId);
    return {
      portfolio_id: active.portfolio_id,
      title: active.title,
      alignment: active.alignment,
      total_diff: active.total_diff,
      items: active.alignment_items || [],
    };
  } catch (err) {
    if (err instanceof AppError && err.status === 404) {
      return { portfolio_id: null, title: null, alignment: null, total_diff: null, items: [] };
    }
    throw err;
  }
};

// TO-02: 팀 계좌 주문 실행
const placeTeamOrder = async (userId, orderParams) => {
  const membership = await requireTraderPosition(userId);

  const team = await teamRepository.findById(membership.team_id);
  const teamAccount = await accountService.getOrCreateTeamAccount(membership.team_id, team.school_id);

  return tradingService.executeOrderPlacement(teamAccount, userId, orderParams);
};

// TO-03: 팀 주문 내역
const listTeamOrders = async (userId, { status, page, limit }) => {
  const membership = await requireTeamMembership(userId);

  const team = await teamRepository.findById(membership.team_id);
  const account = await accountService.getOrCreateTeamAccount(membership.team_id, team.school_id);

  return tradingRepository.listOrdersByAccount(account.id, { status, page, limit });
};

module.exports = { getExecutionQueue, placeTeamOrder, listTeamOrders };
