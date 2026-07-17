const pool = require('../../config/db');

const createProposal = async (conn, data) => {
  const [result] = await conn.query(
    `INSERT INTO TradeProposals
       (team_id, proposed_by, stock_code, order_type, quantity, target_price, rationale, market_analysis, risk_analysis)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.team_id,
      data.proposed_by,
      data.stock_code,
      data.order_type,
      data.quantity,
      data.target_price,
      data.rationale,
      data.market_analysis || null,
      data.risk_analysis || null,
    ]
  );
  return result.insertId;
};

const findById = async (id) => {
  const [rows] = await pool.query(
    `SELECT tp.*, u.nickname AS proposer_nickname, s.stock_name
     FROM TradeProposals tp
     JOIN Users u ON tp.proposed_by = u.id
     LEFT JOIN Stocks s ON tp.stock_code = s.stock_code
     WHERE tp.id = ?`,
    [id]
  );
  return rows[0] || null;
};

const findByTeamId = async (teamId, status) => {
  let sql = `SELECT tp.*, u.nickname AS proposer_nickname, s.stock_name
     FROM TradeProposals tp
     JOIN Users u ON tp.proposed_by = u.id
     LEFT JOIN Stocks s ON tp.stock_code = s.stock_code
     WHERE tp.team_id = ?`;
  const params = [teamId];

  if (status) {
    sql += ' AND tp.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY tp.created_at DESC';

  const [rows] = await pool.query(sql, params);
  return rows;
};

const updateVoteCounts = async (conn, proposalId) => {
  await conn.query(
    `UPDATE TradeProposals SET
       approval_count  = (SELECT COUNT(*) FROM TradeProposalVotes WHERE proposal_id = ? AND is_approved = TRUE),
       rejection_count = (SELECT COUNT(*) FROM TradeProposalVotes WHERE proposal_id = ? AND is_approved = FALSE)
     WHERE id = ?`,
    [proposalId, proposalId, proposalId]
  );
};

const updateStatus = async (conn, id, status) => {
  await conn.query('UPDATE TradeProposals SET status = ? WHERE id = ?', [status, id]);
};

// ── Votes ──

const createVote = async (conn, proposalId, voterId, isApproved) => {
  await conn.query(
    'INSERT INTO TradeProposalVotes (proposal_id, voter_id, is_approved) VALUES (?, ?, ?)',
    [proposalId, voterId, isApproved]
  );
};

const findVotesByProposalId = async (proposalId) => {
  const [rows] = await pool.query(
    `SELECT tpv.*, u.nickname AS voter_nickname
     FROM TradeProposalVotes tpv
     JOIN Users u ON tpv.voter_id = u.id
     WHERE tpv.proposal_id = ?`,
    [proposalId]
  );
  return rows;
};

const findVoteByVoterAndProposal = async (proposalId, voterId) => {
  const [rows] = await pool.query(
    'SELECT * FROM TradeProposalVotes WHERE proposal_id = ? AND voter_id = ?',
    [proposalId, voterId]
  );
  return rows[0] || null;
};

module.exports = {
  createProposal,
  findById,
  findByTeamId,
  updateVoteCounts,
  updateStatus,
  createVote,
  findVotesByProposalId,
  findVoteByVoterAndProposal,
};
