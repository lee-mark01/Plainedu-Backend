// Seasons / VirtualAccounts 데이터 접근
// 모든 함수는 executor(=pool 또는 트랜잭션 conn)를 첫 인자로 받아
// 호출자가 트랜잭션 안에서든 밖에서든 그대로 재사용할 수 있게 한다.

const findActiveSeason = async (executor) => {
  const [rows] = await executor.query("SELECT * FROM Seasons WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1");
  return rows[0] || null;
};

const findSeasonById = async (executor, seasonId) => {
  const [rows] = await executor.query('SELECT * FROM Seasons WHERE id = ?', [seasonId]);
  return rows[0] || null;
};

// 전 시즌 목록 (최신순) — 지난 시즌 결과 화면의 화살표 내비게이션용.
// 날짜는 DATE_FORMAT으로 고정한다 (드라이버가 DATE를 Date로 주면 ISO 변환 시 하루 밀림).
const findAllSeasons = async (executor) => {
  const [rows] = await executor.query(
    `SELECT id, name,
            DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
            total_days, status
     FROM Seasons
     ORDER BY start_date DESC, id DESC`
  );
  return rows;
};

// 종료일이 지난 시즌 닫기. 조건부 UPDATE라 이미 닫힌 시즌에 재실행해도 안전(멱등).
const completeSeason = async (executor, seasonId) => {
  const [result] = await executor.query(
    "UPDATE Seasons SET status = 'COMPLETED' WHERE id = ? AND status = 'ACTIVE'",
    [seasonId]
  );
  return result.affectedRows > 0;
};

// 시즌 생성. uq_seasons_single_active(생성 컬럼 UNIQUE)가 "ACTIVE 시즌 최대 1개"를 강제하므로,
// 동시 전환 경합에서 진 요청은 예외 대신 null을 받고 호출부가 이긴 요청의 시즌을 다시 읽는다.
const createSeason = async (executor, { name, start_date, end_date, total_days }) => {
  try {
    const [result] = await executor.query(
      "INSERT INTO Seasons (name, start_date, end_date, total_days, status) VALUES (?, ?, ?, ?, 'ACTIVE')",
      [name, start_date, end_date, total_days]
    );
    return result.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return null; // 다른 요청이 이미 이 분기 시즌을 만들었다
    throw err;
  }
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

// 갱신 여부는 호출부가 판단한다. 예전엔 SQL에 `AND school_group IS NULL`이 붙어 있었는데,
// 그러면 학교를 바꿔도(대학→고교) 이미 박힌 그룹을 못 고쳐 리그가 옛 그룹에 남는다.
// 최초 채우기 경로(getOrCreateIndividualAccount)는 이미 JS에서 NULL을 확인하고 부른다.
const updateAccountSchoolGroup = async (executor, accountId, schoolGroup) => {
  await executor.query('UPDATE VirtualAccounts SET school_group = ? WHERE id = ?', [schoolGroup, accountId]);
};

// --- valuation 모듈용 조회/갱신 ---

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

// held 태그 동기화용(docs/market-data-strategy.md §4 held) — 시즌 내 보유수량>0인 계좌들의
// 중복 없는 종목코드 목록. season_id + account_id 경로로 이미 인덱스를 탄다.
const findDistinctHeldStockCodes = async (executor, seasonId) => {
  const [rows] = await executor.query(
    `SELECT DISTINCT h.stock_code
     FROM AccountHoldings h
     JOIN VirtualAccounts a ON a.id = h.account_id
     WHERE a.season_id = ? AND h.quantity > 0`,
    [seasonId]
  );
  return rows.map((r) => r.stock_code);
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

// rows: [{ account_id, recorded_at, total_equity, return_rate }] — 일일 자산 스냅샷.
// uq_aah_account_date로 같은 날 재실행 시 UPDATE(멱등). 청크 분할은 호출자 책임.
const upsertAssetHistories = async (executor, rows) => {
  if (!rows.length) return;
  const values = rows.map((r) => [r.account_id, r.recorded_at, r.total_equity, r.return_rate]);
  await executor.query(
    `INSERT INTO AccountAssetHistories (account_id, recorded_at, total_equity, return_rate)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       total_equity = VALUES(total_equity),
       return_rate = VALUES(return_rate)`,
    [values]
  );
};

// 자산 추이 조회 (오름차순 = 그래프 x축 순서).
// 계좌는 시즌마다 새로 생기므로 account_id만으로 시즌 범위가 정해진다 → 기간 조건 불필요.
const findAssetHistories = async (executor, accountId) => {
  const [rows] = await executor.query(
    `SELECT DATE_FORMAT(recorded_at, '%Y-%m-%d') AS date, total_equity, return_rate
     FROM AccountAssetHistories
     WHERE account_id = ?
     ORDER BY recorded_at`,
    [accountId]
  );
  return rows;
};

module.exports = {
  findActiveSeason,
  findSeasonById,
  findAllSeasons,
  completeSeason,
  createSeason,
  findIndividualAccount,
  findTeamAccount,
  createVirtualAccount,
  updateAccountSchoolGroup,
  findAccountById,
  findAccountsBySeason,
  findHoldingsByAccountId,
  findHoldingsBySeason,
  findDistinctHeldStockCodes,
  bulkUpdateEquity,
  upsertAssetHistories,
  findAssetHistories,
};
