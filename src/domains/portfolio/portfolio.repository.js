const pool = require('../../config/db');

// ── Portfolio CRUD ──

const createPortfolio = async (conn, data) => {
  const [result] = await conn.query(
    `INSERT INTO Portfolios (team_id, type, parent_id, proposed_by, title, description, analysis, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.team_id,
      data.type || 'NEW',
      data.parent_id || null,
      data.proposed_by,
      data.title || '',
      data.description || null,
      data.analysis || null,
      data.status || 'DRAFT',
    ]
  );
  return result.insertId;
};

const updatePortfolio = async (conn, id, data) => {
  const fields = [];
  const params = [];
  for (const key of ['title', 'description', 'analysis', 'status']) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      params.push(data[key]);
    }
  }
  if (fields.length === 0) return;
  params.push(id);
  await conn.query(`UPDATE Portfolios SET ${fields.join(', ')} WHERE id = ?`, params);
};

const findById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM Portfolios WHERE id = ?', [id]);
  return rows[0] || null;
};

const findByTeamId = async (teamId) => {
  const [rows] = await pool.query(
    `SELECT p.*, u.nickname AS proposer_nickname
     FROM Portfolios p
     JOIN Users u ON p.proposed_by = u.id
     WHERE p.team_id = ?
     ORDER BY p.created_at DESC`,
    [teamId]
  );
  return rows;
};

const deletePortfolio = async (conn, id) => {
  await conn.query('DELETE FROM Portfolios WHERE id = ?', [id]);
};

const updateVoteCounts = async (conn, portfolioId) => {
  await conn.query(
    `UPDATE Portfolios SET
       approval_count  = (SELECT COUNT(*) FROM PortfolioVotes WHERE portfolio_id = ? AND is_approved = TRUE),
       rejection_count = (SELECT COUNT(*) FROM PortfolioVotes WHERE portfolio_id = ? AND is_approved = FALSE)
     WHERE id = ?`,
    [portfolioId, portfolioId, portfolioId]
  );
};

// ── Allocations ──

const createAllocations = async (conn, portfolioId, allocations) => {
  if (!allocations || allocations.length === 0) return;
  const values = allocations.map((a) => [portfolioId, a.stock_code, a.target_percentage, a.reason || null]);
  await conn.query(
    'INSERT INTO PortfolioAllocations (portfolio_id, stock_code, target_percentage, reason) VALUES ?',
    [values]
  );
};

const deleteAllocations = async (conn, portfolioId) => {
  await conn.query('DELETE FROM PortfolioAllocations WHERE portfolio_id = ?', [portfolioId]);
};

const findAllocationsByPortfolioId = async (portfolioId) => {
  const [rows] = await pool.query(
    `SELECT pa.*, s.name AS stock_name
     FROM PortfolioAllocations pa
     LEFT JOIN Stocks s ON pa.stock_code = s.stock_code
     WHERE pa.portfolio_id = ?`,
    [portfolioId]
  );
  return rows;
};

// ── Votes ──

const createVote = async (conn, portfolioId, voterId, isApproved) => {
  await conn.query(
    'INSERT INTO PortfolioVotes (portfolio_id, voter_id, is_approved) VALUES (?, ?, ?)',
    [portfolioId, voterId, isApproved]
  );
};

const findVotesByPortfolioId = async (portfolioId) => {
  const [rows] = await pool.query(
    `SELECT pv.*, u.nickname AS voter_nickname
     FROM PortfolioVotes pv
     JOIN Users u ON pv.voter_id = u.id
     WHERE pv.portfolio_id = ?`,
    [portfolioId]
  );
  return rows;
};

const findVoteByVoterAndPortfolio = async (portfolioId, voterId) => {
  const [rows] = await pool.query(
    'SELECT * FROM PortfolioVotes WHERE portfolio_id = ? AND voter_id = ?',
    [portfolioId, voterId]
  );
  return rows[0] || null;
};

// ── Active Portfolio ──

const findActiveByTeamId = async (teamId) => {
  const [rows] = await pool.query(
    `SELECT tap.*, p.title, p.description, p.analysis, p.proposed_by, p.type, p.parent_id,
            p.approval_count, p.rejection_count, p.created_at AS portfolio_created_at,
            u.nickname AS proposer_nickname
     FROM TeamActivePortfolios tap
     JOIN Portfolios p ON tap.portfolio_id = p.id
     JOIN Users u ON p.proposed_by = u.id
     WHERE tap.team_id = ?`,
    [teamId]
  );
  return rows[0] || null;
};

const activatePortfolio = async (conn, teamId, portfolioId) => {
  await conn.query(
    `INSERT INTO TeamActivePortfolios (team_id, portfolio_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE portfolio_id = VALUES(portfolio_id), activated_at = NOW(),
       weekly_update_count = 0, weekly_total_trade_amount = 0, weekly_turnover_rate = 0`,
    [teamId, portfolioId]
  );
};

const archivePreviousActive = async (conn, teamId) => {
  // 기존 Active MP를 ARCHIVED로 변경
  const [active] = await conn.query(
    'SELECT portfolio_id FROM TeamActivePortfolios WHERE team_id = ?',
    [teamId]
  );
  if (active.length > 0) {
    await conn.query(
      "UPDATE Portfolios SET status = 'ARCHIVED' WHERE id = ? AND status = 'APPROVED'",
      [active[0].portfolio_id]
    );
  }
};

module.exports = {
  createPortfolio,
  updatePortfolio,
  findById,
  findByTeamId,
  deletePortfolio,
  updateVoteCounts,
  createAllocations,
  deleteAllocations,
  findAllocationsByPortfolioId,
  createVote,
  findVotesByPortfolioId,
  findVoteByVoterAndPortfolio,
  findActiveByTeamId,
  activatePortfolio,
  archivePreviousActive,
};
