const pool = require('../../config/db');
const AppError = require('../../errors/AppError');
const portfolioRepository = require('./portfolio.repository');
const teamRepository = require('../team/team.repository');
const { requireTeamMembership } = require('../team/team.service');
const accountService = require('../account/account.service');
const { getAccountValuation } = require('../account/account.valuation');
const { calculateAlignment } = require('./portfolio.alignment');

// ── MP 홈: 목록 조회 ──

const listPortfolios = async (userId) => {
  const membership = await requireTeamMembership(userId);
  const teamId = membership.team_id;

  const all = await portfolioRepository.findByTeamId(teamId);
  const active = await portfolioRepository.findActiveByTeamId(teamId);

  // 카테고리별 분류
  const drafts = all.filter((p) => p.status === 'DRAFT' && p.proposed_by === userId);
  const pending = all.filter((p) => p.status === 'PENDING');
  const archived = all.filter((p) => p.status === 'ARCHIVED');

  // 각 MP에 allocations 붙이기
  const attachAllocations = async (list) => {
    for (const p of list) {
      p.allocations = await portfolioRepository.findAllocationsByPortfolioId(p.id);
    }
    return list;
  };

  await Promise.all([attachAllocations(drafts), attachAllocations(pending), attachAllocations(archived)]);

  let activeData = null;
  if (active) {
    const allocations = await portfolioRepository.findAllocationsByPortfolioId(active.portfolio_id);
    activeData = { ...active, allocations };
  }

  return { active: activeData, drafts, pending, archived };
};

// ── Active MP 상세 (목표 vs 현재 비중 + Alignment) ──

const getActivePortfolio = async (userId) => {
  const membership = await requireTeamMembership(userId);
  const teamId = membership.team_id;

  const active = await portfolioRepository.findActiveByTeamId(teamId);
  if (!active) throw new AppError('운용 중인 모델포트폴리오가 없습니다.', 404);

  const allocations = await portfolioRepository.findAllocationsByPortfolioId(active.portfolio_id);

  // 팀 계좌 평가 데이터 가져오기
  const teamAccount = await accountService.getOrCreateTeamAccount(teamId, null);
  const valuation = await getAccountValuation(teamAccount.id);

  // 현재가 기반 holdings 데이터 구성
  const holdings = (valuation.holdings || []).map((h) => ({
    stock_code: h.stock_code,
    quantity: h.quantity,
    current_price: h.current_price,
  }));

  const alignmentResult = calculateAlignment({
    allocations,
    holdings,
    cashBalance: valuation.cash_balance,
  });

  return {
    ...active,
    allocations,
    alignment: alignmentResult.alignment,
    alignment_items: alignmentResult.items,
    total_diff: alignmentResult.totalDiff,
    account: {
      cash_balance: valuation.cash_balance,
      total_equity: valuation.total_equity,
      return_rate: valuation.return_rate,
    },
  };
};

// ── MP 상세 조회 ──

const getPortfolioDetail = async (userId, portfolioId) => {
  const membership = await requireTeamMembership(userId);

  const portfolio = await portfolioRepository.findById(portfolioId);
  if (!portfolio || portfolio.team_id !== membership.team_id) {
    throw new AppError('포트폴리오를 찾을 수 없습니다.', 404);
  }

  const allocations = await portfolioRepository.findAllocationsByPortfolioId(portfolioId);
  const votes = await portfolioRepository.findVotesByPortfolioId(portfolioId);

  return { ...portfolio, allocations, votes };
};

// ── 새 MP 작성 (Draft 저장 or 바로 제출) ──

const createPortfolio = async (userId, data) => {
  const membership = await requireTeamMembership(userId);
  const teamId = membership.team_id;

  // 비중 합계 검증 (제출 시에만 100% 강제)
  if (data.status === 'PENDING') {
    validateAllocationsSum(data.allocations);
  }
  if (data.parent_id) {
    const parent = await portfolioRepository.findById(data.parent_id);
    if (!parent || parent.team_id !== teamId) {
      throw new AppError('상위 포트폴리오를 찾을 수 없습니다.', 404);
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const portfolioId = await portfolioRepository.createPortfolio(conn, {
      team_id: teamId,
      type: data.type || 'NEW',
      parent_id: data.parent_id || null,
      proposed_by: userId,
      title: data.title || '',
      description: data.description || null,
      analysis: data.analysis || null,
      status: data.status || 'DRAFT',
    });

    if (data.allocations && data.allocations.length > 0) {
      await portfolioRepository.createAllocations(conn, portfolioId, data.allocations);
    }

    await conn.commit();
    return { id: portfolioId, status: data.status || 'DRAFT' };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
};

// ── Draft MP 수정 ──

const updatePortfolio = async (userId, portfolioId, data) => {
  const portfolio = await portfolioRepository.findById(portfolioId);
  if (!portfolio) throw new AppError('포트폴리오를 찾을 수 없습니다.', 404);
  if (portfolio.proposed_by !== userId) throw new AppError('본인이 작성한 MP만 수정할 수 있습니다.', 403);
  if (portfolio.status !== 'DRAFT') throw new AppError('작성 중(Draft) 상태의 MP만 수정할 수 있습니다.', 400);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await portfolioRepository.updatePortfolio(conn, portfolioId, {
      title: data.title,
      description: data.description,
      analysis: data.analysis,
    });

    if (data.allocations) {
      await portfolioRepository.deleteAllocations(conn, portfolioId);
      if (data.allocations.length > 0) {
        await portfolioRepository.createAllocations(conn, portfolioId, data.allocations);
      }
    }

    await conn.commit();
    return { id: portfolioId, status: 'DRAFT' };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
};

// ── Draft MP 삭제 ──

const deletePortfolio = async (userId, portfolioId) => {
  const portfolio = await portfolioRepository.findById(portfolioId);
  if (!portfolio) throw new AppError('포트폴리오를 찾을 수 없습니다.', 404);
  if (portfolio.proposed_by !== userId) throw new AppError('본인이 작성한 MP만 삭제할 수 있습니다.', 403);
  if (portfolio.status !== 'DRAFT') throw new AppError('작성 중(Draft) 상태의 MP만 삭제할 수 있습니다.', 400);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await portfolioRepository.deletePortfolio(conn, portfolioId);
    await conn.commit();
    return { id: portfolioId };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
};

// ── Draft → PENDING 제출 ──

const submitPortfolio = async (userId, portfolioId) => {
  const portfolio = await portfolioRepository.findById(portfolioId);
  if (!portfolio) throw new AppError('포트폴리오를 찾을 수 없습니다.', 404);
  if (portfolio.proposed_by !== userId) throw new AppError('본인이 작성한 MP만 제출할 수 있습니다.', 403);
  if (portfolio.status !== 'DRAFT') throw new AppError('작성 중(Draft) 상태의 MP만 제출할 수 있습니다.', 400);

  // 제출 시 필수 필드 검증
  if (!portfolio.title) throw new AppError('MP 제목을 입력해주세요.', 400);
  if (!portfolio.description) throw new AppError('투자 근거를 입력해주세요.', 400);

  const allocations = await portfolioRepository.findAllocationsByPortfolioId(portfolioId);
  if (allocations.length === 0) throw new AppError('종목을 1개 이상 추가해주세요.', 400);
  validateAllocationsSum(allocations.map((a) => ({ target_percentage: Number(a.target_percentage) })));

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await portfolioRepository.updatePortfolio(conn, portfolioId, { status: 'PENDING' });
    await conn.commit();
    return { id: portfolioId, status: 'PENDING' };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
};

// ── 투표 ──

const vote = async (userId, portfolioId, isApproved) => {
  const membership = await requireTeamMembership(userId);

  const portfolio = await portfolioRepository.findById(portfolioId);
  if (!portfolio) throw new AppError('포트폴리오를 찾을 수 없습니다.', 404);
  if (portfolio.team_id !== membership.team_id) throw new AppError('같은 팀의 MP에만 투표할 수 있습니다.', 403);
  if (portfolio.status !== 'PENDING') throw new AppError('투표 중인 MP에만 투표할 수 있습니다.', 400);

  const existingVote = await portfolioRepository.findVoteByVoterAndPortfolio(portfolioId, userId);
  if (existingVote) throw new AppError('이미 투표했습니다.', 409);

  // 팀원 수 조회
  const members = await teamRepository.findMembersByTeamId(portfolio.team_id);
  const totalMembers = members.length;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await portfolioRepository.createVote(conn, portfolioId, userId, isApproved);
    await portfolioRepository.updateVoteCounts(conn, portfolioId);

    // 투표 결과 확인 (과반수 기준)
    const [[updated]] = await conn.query('SELECT approval_count, rejection_count FROM Portfolios WHERE id = ?', [
      portfolioId,
    ]);
    const majority = Math.ceil(totalMembers / 2);

    let finalStatus = 'PENDING';
    if (updated.approval_count >= majority) {
      // 가결 → APPROVED, Active 등록
      await portfolioRepository.updatePortfolio(conn, portfolioId, { status: 'APPROVED' });
      await portfolioRepository.archivePreviousActive(conn, portfolio.team_id);
      await portfolioRepository.activatePortfolio(conn, portfolio.team_id, portfolioId);
      finalStatus = 'APPROVED';
    } else if (updated.rejection_count >= majority) {
      // 부결
      await portfolioRepository.updatePortfolio(conn, portfolioId, { status: 'REJECTED' });
      finalStatus = 'REJECTED';
    }

    await conn.commit();

    return {
      portfolio_id: portfolioId,
      vote: isApproved ? 'APPROVE' : 'REJECT',
      approval_count: updated.approval_count,
      rejection_count: updated.rejection_count,
      status: finalStatus,
    };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
};

// ── 투표 현황 조회 ──

const getVotes = async (userId, portfolioId) => {
  const membership = await requireTeamMembership(userId);

  const portfolio = await portfolioRepository.findById(portfolioId);
  if (!portfolio || portfolio.team_id !== membership.team_id) {
    throw new AppError('포트폴리오를 찾을 수 없습니다.', 404);
  }

  const votes = await portfolioRepository.findVotesByPortfolioId(portfolioId);
  return {
    portfolio_id: portfolioId,
    status: portfolio.status,
    approval_count: portfolio.approval_count,
    rejection_count: portfolio.rejection_count,
    votes,
  };
};

// ── 헬퍼 ──

const validateAllocationsSum = (allocations) => {
  const sum = allocations.reduce((acc, a) => acc + Number(a.target_percentage), 0);
  if (Math.abs(sum - 100) > 0.01) {
    throw new AppError(`비중 합계가 100%여야 합니다. (현재: ${sum}%)`, 400, 'INVALID_ALLOCATION_SUM');
  }
};

module.exports = {
  listPortfolios,
  getActivePortfolio,
  getPortfolioDetail,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  submitPortfolio,
  vote,
  getVotes,
};
