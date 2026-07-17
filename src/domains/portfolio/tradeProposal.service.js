const pool = require('../../config/db');
const AppError = require('../../errors/AppError');
const tradeProposalRepository = require('./tradeProposal.repository');
const teamRepository = require('../team/team.repository');

// ── 팀 멤버십 검증 헬퍼 ──

const requireTeamMembership = async (userId) => {
  const membership = await teamRepository.findMembershipByUserId(userId);
  if (!membership) throw new AppError('소속된 팀이 없습니다.', 403);
  return membership;
};

// ── 매매 제안 목록 ──

const listProposals = async (userId, query) => {
  const membership = await requireTeamMembership(userId);
  return tradeProposalRepository.findByTeamId(membership.team_id, query.status);
};

// ── 매매 제안 상세 ──

const getProposalDetail = async (userId, proposalId) => {
  await requireTeamMembership(userId);

  const proposal = await tradeProposalRepository.findById(proposalId);
  if (!proposal) throw new AppError('매매 제안을 찾을 수 없습니다.', 404);

  const votes = await tradeProposalRepository.findVotesByProposalId(proposalId);
  return { ...proposal, votes };
};

// ── 매매 제안 작성 ──

const createProposal = async (userId, data) => {
  const membership = await requireTeamMembership(userId);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const id = await tradeProposalRepository.createProposal(conn, {
      team_id: membership.team_id,
      proposed_by: userId,
      stock_code: data.stock_code,
      order_type: data.order_type,
      quantity: data.quantity,
      target_price: data.target_price,
      rationale: data.rationale,
      market_analysis: data.market_analysis,
      risk_analysis: data.risk_analysis,
    });

    await conn.commit();
    return { id, status: 'PENDING' };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
};

// ── 매매 제안 투표 ──

const vote = async (userId, proposalId, isApproved) => {
  const membership = await requireTeamMembership(userId);

  const proposal = await tradeProposalRepository.findById(proposalId);
  if (!proposal) throw new AppError('매매 제안을 찾을 수 없습니다.', 404);
  if (proposal.team_id !== membership.team_id) throw new AppError('같은 팀의 제안에만 투표할 수 있습니다.', 403);
  if (proposal.status !== 'PENDING') throw new AppError('투표 중인 제안에만 투표할 수 있습니다.', 400);

  const existingVote = await tradeProposalRepository.findVoteByVoterAndProposal(proposalId, userId);
  if (existingVote) throw new AppError('이미 투표했습니다.', 409);

  const members = await teamRepository.findMembersByTeamId(proposal.team_id);
  const totalMembers = members.length;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await tradeProposalRepository.createVote(conn, proposalId, userId, isApproved);
    await tradeProposalRepository.updateVoteCounts(conn, proposalId);

    const [[updated]] = await conn.query(
      'SELECT approval_count, rejection_count FROM TradeProposals WHERE id = ?',
      [proposalId]
    );
    const majority = Math.ceil(totalMembers / 2);

    let finalStatus = 'PENDING';
    if (updated.approval_count >= majority) {
      await tradeProposalRepository.updateStatus(conn, proposalId, 'APPROVED');
      finalStatus = 'APPROVED';
    } else if (updated.rejection_count >= majority) {
      await tradeProposalRepository.updateStatus(conn, proposalId, 'REJECTED');
      finalStatus = 'REJECTED';
    }

    await conn.commit();

    return {
      proposal_id: proposalId,
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

module.exports = { listProposals, getProposalDetail, createProposal, vote };
