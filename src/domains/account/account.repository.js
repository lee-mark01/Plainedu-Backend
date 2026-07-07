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

module.exports = {
  findActiveSeason,
  createSeason,
  findIndividualAccount,
  findTeamAccount,
  createVirtualAccount,
  updateAccountSchoolGroup,
};
