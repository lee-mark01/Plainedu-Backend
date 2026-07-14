// Seasons / VirtualAccounts 데이터 접근
// 모든 함수는 executor(=pool 또는 트랜잭션 conn)를 첫 인자로 받아
// 호출자가 트랜잭션 안에서든 밖에서든 그대로 재사용할 수 있게 한다.

const findActiveSeason = async (executor) => {
  const [rows] = await executor.query("SELECT * FROM Seasons WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1");
  return rows[0] || null;
};

const createSeason = async (executor, { name, start_date, end_date, total_days }) => {
  const [result] = await executor.query(
    "INSERT INTO Seasons (name, start_date, end_date, total_days, status) VALUES (?, ?, ?, ?, 'ACTIVE')",
    [name, start_date, end_date, total_days]
  );
  return result.insertId;
};

const findIndividualAccount = async (executor, userId, seasonId) => {
  const [rows] = await executor.query(
    "SELECT * FROM VirtualAccounts WHERE user_id = ? AND season_id = ? AND account_type = 'INDIVIDUAL'",
    [userId, seasonId]
  );
  return rows[0] || null;
};

const findTeamAccount = async (executor, teamId, seasonId) => {
  const [rows] = await executor.query(
    "SELECT * FROM VirtualAccounts WHERE team_id = ? AND season_id = ? AND account_type = 'TEAM'",
    [teamId, seasonId]
  );
  return rows[0] || null;
};

const createVirtualAccount = async (
  executor,
  { account_type, school_group, user_id, team_id, season_id, initial_cash }
) => {
  const [result] = await executor.query(
    `INSERT INTO VirtualAccounts (account_type, school_group, user_id, team_id, season_id, initial_cash, cash_balance, total_equity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [account_type, school_group ?? null, user_id ?? null, team_id ?? null, season_id, initial_cash, initial_cash, initial_cash]
  );
  return result.insertId;
};

const updateAccountSchoolGroup = async (executor, accountId, schoolGroup) => {
  await executor.query('UPDATE VirtualAccounts SET school_group = ? WHERE id = ? AND school_group IS NULL', [
    schoolGroup,
    accountId,
  ]);
};

// --- valuation 모듈용 조회/갱신 (스펙: docs/specs/spec-account-valuation.md §4.3) ---

const findAccountById = async (executor, accountId) => {
  const [rows] = await executor.query('SELECT * FROM VirtualAccounts WHERE id = ?', [accountId]);
  return rows[0] || null;
};

const findAccountsBySeason = async (executor, seasonId) => {
  const [rows] = await executor.query(
    'SELECT id, account_type, user_id, team_id, school_group, initial_cash, cash_balance FROM VirtualAccounts WHERE season_id = ?',
    [seasonId]
  );
  return rows;
};

const findHoldingsByAccountId = async (executor, accountId) => {
  const [rows] = await executor.query(
    'SELECT stock_code, quantity, average_buy_price FROM AccountHoldings WHERE account_id = ? AND quantity > 0',
    [accountId]
  );
  return rows;
};

const findHoldingsBySeason = async (executor, seasonId) => {
  const [rows] = await executor.query(
    `SELECT h.account_id, h.stock_code, h.quantity, h.average_buy_price
     FROM AccountHoldings h
     JOIN VirtualAccounts a ON a.id = h.account_id
     WHERE a.season_id = ? AND h.quantity > 0`,
    [seasonId]
  );
  return rows;
};

// rows: [{ id, total_equity, current_return_rate }] — 한 번의 CASE WHEN UPDATE(단일 문 = 원자적).
// 청크 분할은 호출자(valuation) 책임.
const bulkUpdateEquity = async (executor, rows) => {
  if (!rows.length) return;
  const caseSql = rows.map(() => 'WHEN ? THEN ?').join(' ');
  const equityParams = rows.flatMap((r) => [r.id, r.total_equity]);
  const rateParams = rows.flatMap((r) => [r.id, r.current_return_rate]);
  const ids = rows.map((r) => r.id);
  await executor.query(
    `UPDATE VirtualAccounts
     SET total_equity = CASE id ${caseSql} END,
         current_return_rate = CASE id ${caseSql} END
     WHERE id IN (${ids.map(() => '?').join(',')})`,
    [...equityParams, ...rateParams, ...ids]
  );
};

module.exports = {
  findActiveSeason,
  createSeason,
  findIndividualAccount,
  findTeamAccount,
  createVirtualAccount,
  updateAccountSchoolGroup,
  findAccountById,
  findAccountsBySeason,
  findHoldingsByAccountId,
  findHoldingsBySeason,
  bulkUpdateEquity,
};
