// 전체 기능(소속/팀/개인/리그) 테스트용 종합 더미 데이터 시딩 스크립트
//
// 사용법:
//   npm run seed:demo
//
// 사전 조건: npm run seed:stocks가 먼저 실행되어 AAPL/MSFT/TSLA/GOOGL/NVDA가
// Stocks 테이블에 있어야 함(매수 주문에 필요).
//
// 만드는 것:
//   - 학교 2개(고교/대학), 유저 9명(팀/개인/학교인증X/학교없음 조합)
//   - 활성 시즌 1개(없으면 자동 생성)
//   - 팀 1개(팀장+팀원2, 팀장은 Trader 포지션) + 팀 계좌
//   - 개인 계좌 (학교인증된 유저 전원)
//   - MARKET 매수 주문(개인 5건 + 팀 1건)으로 실제 보유종목/평가금액 차이 생성
//   - rankingService.recomputeRankings를 직접 호출해 장 시간과 무관하게 즉시 리그 순위 반영
//
// 유저/학교/주문은 재실행해도 안전(idempotent)하지만, 주문은 두 번째 실행부턴
// 잔액 부족으로 실패할 수 있음 — 정상 동작이며 스킵하고 계속 진행됨.
require('dotenv').config();

const pool = require('../../src/config/db');
const AppError = require('../../src/errors/AppError');
const { signAccessToken } = require('../../src/utils/jwt');
const accountService = require('../../src/domains/account/account.service');
const teamService = require('../../src/domains/team/team.service');
const teamRepository = require('../../src/domains/team/team.repository');
const tradingService = require('../../src/domains/trading/trading.service');
const teamOrderService = require('../../src/domains/trading/teamOrder.service');
const rankingService = require('../../src/domains/ranking/ranking.service');
const portfolioService = require('../../src/domains/portfolio/portfolio.service');

const DUMMY_SCHOOLS = [
  { schoolName: '테스트고등학교', region: '테스트' },
  { schoolName: '테스트대학교', region: '테스트' },
];

const DUMMY_USERS = [
  // 고교 - 팀 (팀장 + 팀원 2명)
  { email: 'dummy.leader@test.com', nickname: '더미팀장', school: '테스트고등학교', verified: true },
  { email: 'dummy.member1@test.com', nickname: '더미팀원1', school: '테스트고등학교', verified: true },
  { email: 'dummy.member2@test.com', nickname: '더미팀원2', school: '테스트고등학교', verified: true },
  // 고교 - 개인만 (같은 학교 리그 비교용)
  { email: 'dummy.solo1@test.com', nickname: '더미개인1', school: '테스트고등학교', verified: true },
  { email: 'dummy.solo2@test.com', nickname: '더미개인2', school: '테스트고등학교', verified: true },
  // 대학 - 개인만 (다른 리그 그룹 비교용)
  { email: 'dummy.univ1@test.com', nickname: '더미대학생1', school: '테스트대학교', verified: true },
  { email: 'dummy.univ2@test.com', nickname: '더미대학생2', school: '테스트대학교', verified: true },
  // 엣지 케이스 (학교인증/팀가입 실패 케이스 테스트용)
  { email: 'dummy.unverified@test.com', nickname: '더미미인증', school: '테스트고등학교', verified: false },
  { email: 'dummy.noschool@test.com', nickname: '더미학교없음', school: null, verified: false },
];

const REQUIRED_STOCKS = ['AAPL', 'MSFT', 'TSLA', 'GOOGL', 'NVDA'];

// 계좌마다 다른 종목/수량을 사서 리그 순위에 실제 차이가 나게 함
const INDIVIDUAL_ORDER_PLAN = {
  'dummy.leader@test.com': [{ stock_code: 'AAPL', qty: 5 }, { stock_code: 'MSFT', qty: 3 }],
  'dummy.member1@test.com': [{ stock_code: 'MSFT', qty: 4 }],
  'dummy.solo1@test.com': [{ stock_code: 'MSFT', qty: 8 }],
  'dummy.solo2@test.com': [{ stock_code: 'TSLA', qty: 6 }],
  'dummy.univ1@test.com': [{ stock_code: 'GOOGL', qty: 4 }],
  'dummy.univ2@test.com': [{ stock_code: 'AAPL', qty: 3 }],
};

const TEAM_ORDER_PLAN = [{ stock_code: 'NVDA', qty: 10 }];
const TEAM_NAME = '더미팀';
const TEAM_MAX_MEMBERS = 5;
const MP_PLAN = {
  title: '[QA] 성장주 모델포트폴리오',
  description: 'QA 테스트용 활성 포트폴리오',
  analysis: 'AI 반도체와 대형 기술주 비중 테스트',
  allocations: [
    { stock_code: 'NVDA', target_percentage: 60, reason: 'AI 수요 지속' },
    { stock_code: 'AAPL', target_percentage: 40, reason: '대형 기술주 편입' },
  ],
};

const upsertSchool = async ({ schoolName, region }) => {
  await pool.query('INSERT IGNORE INTO schools (school_name, region) VALUES (?, ?)', [schoolName, region]);
  const [rows] = await pool.query('SELECT id FROM schools WHERE school_name = ? AND region = ?', [schoolName, region]);
  return rows[0].id;
};

const upsertUser = async (u, school_id) => {
  await pool.query(
    `INSERT INTO Users (email, nickname, role, provider, school_id, school_is_verified)
     VALUES (?, ?, 'USER', 'local', ?, ?)
     ON DUPLICATE KEY UPDATE
       nickname = VALUES(nickname),
       school_id = VALUES(school_id),
       school_is_verified = VALUES(school_is_verified)`,
    [u.email, u.nickname, school_id, u.verified ? 1 : 0]
  );
  const [rows] = await pool.query('SELECT id FROM Users WHERE email = ?', [u.email]);
  return rows[0].id;
};

// 이미 완료된 상태(팀 있음/잔액 부족 등)는 에러를 던지지 않고 건너뛴다 — 재실행 안전성용
const runOrSkip = async (label, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (err) {
    const msg = err instanceof AppError ? err.message : err.message;
    console.log(`  - ${label} 건너뜀 (${msg})`);
  }
};

(async () => {
  try {
    console.log('[1/6] 필요 종목 존재 확인...');
    const [stockRows] = await pool.query('SELECT stock_code FROM Stocks WHERE stock_code IN (?)', [REQUIRED_STOCKS]);
    const existingCodes = new Set(stockRows.map((r) => r.stock_code));
    const missing = REQUIRED_STOCKS.filter((c) => !existingCodes.has(c));
    if (missing.length) {
      throw new Error(`Stocks 테이블에 없는 종목: ${missing.join(', ')} — 먼저 "npm run seed:stocks"를 실행하세요.`);
    }

    console.log('[2/6] 학교 생성...');
    const schoolIds = {};
    for (const school of DUMMY_SCHOOLS) {
      schoolIds[school.schoolName] = await upsertSchool(school);
    }

    console.log('[3/6] 유저 생성...');
    const userIds = {};
    for (const u of DUMMY_USERS) {
      const school_id = u.school ? schoolIds[u.school] : null;
      userIds[u.email] = await upsertUser(u, school_id);
    }

    console.log('[4/6] 활성 시즌 확보...');
    const season = await accountService.getOrCreateActiveSeason();

    console.log('[5/6] 개인 계좌 + 팀 생성/가입 + 매수 주문...');

    // 학교 인증된 유저 전원 개인 계좌 확보
    for (const u of DUMMY_USERS.filter((u) => u.verified)) {
      await accountService.getOrCreateIndividualAccount(userIds[u.email]);
    }

    // 팀 생성 (팀장, Trader 포지션) — 이미 팀 있으면 스킵
    const leaderId = userIds['dummy.leader@test.com'];
    await runOrSkip('팀 생성(더미팀장 → Trader)', async () => {
      const team = await teamService.createTeam(leaderId, TEAM_NAME, TEAM_MAX_MEMBERS, 'TRADER');
      global.__demoTeam = team; // join_code를 아래에서 재사용
    });

    // 방금 안 만들어졌으면(이미 있었으면) join_code를 다시 조회
    let team = global.__demoTeam;
    if (!team) {
      const membership = await teamRepository.findMembershipByUserId(leaderId);
      team = await teamRepository.findById(membership.team_id);
    }

    // 팀원 2명 가입 (Analyst 포지션)
    for (const email of ['dummy.member1@test.com', 'dummy.member2@test.com']) {
      await runOrSkip(`팀 가입(${email} → Analyst)`, () =>
        teamService.joinTeam(userIds[email], team.join_code, 'ANALYST')
      );
    }

    // 개인 매수 주문
    for (const [email, orders] of Object.entries(INDIVIDUAL_ORDER_PLAN)) {
      for (const { stock_code, qty } of orders) {
        await runOrSkip(`개인 매수(${email}: ${stock_code} x${qty})`, () =>
          tradingService.placeOrder(userIds[email], {
            stock_code,
            order_type: 'BUY',
            price_type: 'MARKET',
            order_quantity: qty,
          })
        );
      }
    }

    // 팀 매수 주문 (팀장=Trader 권한으로)
    for (const { stock_code, qty } of TEAM_ORDER_PLAN) {
      await runOrSkip(`팀 매수(${stock_code} x${qty})`, () =>
        teamOrderService.placeTeamOrder(leaderId, {
          stock_code,
          order_type: 'BUY',
          price_type: 'MARKET',
          order_quantity: qty,
        })
      );
    }

    await pool.query(
      `INSERT IGNORE INTO Watchlist (user_id, stock_code) VALUES (?, 'AAPL'), (?, 'NVDA')`,
      [leaderId, leaderId]
    );
    const [[leaderAccount]] = await pool.query(
      `SELECT id FROM VirtualAccounts
       WHERE user_id = ? AND season_id = ? AND account_type = 'INDIVIDUAL'`,
      [leaderId, season.id]
    );
    const [[teamAccount]] = await pool.query(
      `SELECT id FROM VirtualAccounts
       WHERE team_id = ? AND season_id = ? AND account_type = 'TEAM'`,
      [team.id, season.id]
    );
    // 외부 시세 API가 잠시 실패해 주문이 건너뛰어도 투자 화면의 필수 fixture는 보장한다.
    await pool.query(
      `INSERT INTO AccountHoldings (account_id, stock_code, quantity, average_buy_price)
       VALUES (?, 'AAPL', 5, 220), (?, 'MSFT', 3, 510), (?, 'NVDA', 10, 180)
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), average_buy_price = VALUES(average_buy_price)`,
      [leaderAccount.id, leaderAccount.id, teamAccount.id]
    );
    await pool.query(
      `INSERT INTO Orders
         (account_id, trader_id, stock_code, order_type, price_type, order_quantity,
          executed_price, executed_quantity, status, completed_at)
       SELECT ?, ?, 'AAPL', 'BUY', 'MARKET', 5, 220, 5, 'COMPLETED', NOW()
       WHERE NOT EXISTS (SELECT 1 FROM Orders WHERE account_id = ? AND stock_code = 'AAPL')`,
      [leaderAccount.id, leaderId, leaderAccount.id]
    );
    await pool.query(
      `INSERT INTO Orders
         (account_id, trader_id, stock_code, order_type, price_type, order_quantity,
          executed_price, executed_quantity, status, completed_at)
       SELECT ?, ?, 'MSFT', 'BUY', 'MARKET', 3, 510, 3, 'COMPLETED', NOW()
       WHERE NOT EXISTS (SELECT 1 FROM Orders WHERE account_id = ? AND stock_code = 'MSFT')`,
      [leaderAccount.id, leaderId, leaderAccount.id]
    );
    await pool.query(
      `INSERT INTO Orders
         (account_id, trader_id, stock_code, order_type, price_type, order_quantity,
          executed_price, executed_quantity, status, completed_at)
       SELECT ?, ?, 'NVDA', 'BUY', 'MARKET', 10, 180, 10, 'COMPLETED', NOW()
       WHERE NOT EXISTS (SELECT 1 FROM Orders WHERE account_id = ? AND stock_code = 'NVDA')`,
      [teamAccount.id, leaderId, teamAccount.id]
    );
    const history = [
      { daysAgo: 2, equity: 100000, rate: 0 },
      { daysAgo: 1, equity: 100850, rate: 0.85 },
      { daysAgo: 0, equity: 101500, rate: 1.5 },
    ];
    for (const item of history) {
      const recordedAt = new Date(Date.now() - item.daysAgo * 86400000).toISOString().slice(0, 10);
      await pool.query(
        `INSERT INTO AccountAssetHistories (account_id, recorded_at, total_equity, return_rate)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE total_equity = VALUES(total_equity), return_rate = VALUES(return_rate)`,
        [leaderAccount.id, recordedAt, item.equity, item.rate]
      );
    }

    console.log('[6/7] QA 모델포트폴리오 작성 및 활성화...');
    const analystId = userIds['dummy.member1@test.com'];
    let activePortfolio = null;
    try {
      activePortfolio = await portfolioService.getActivePortfolio(leaderId);
    } catch (error) {
      if (!(error instanceof AppError && error.status === 404)) throw error;
    }
    if (!activePortfolio) {
      const draft = await portfolioService.createPortfolio(analystId, MP_PLAN);
      await portfolioService.submitPortfolio(analystId, draft.id);
      for (const email of ['dummy.leader@test.com', 'dummy.member2@test.com']) {
        await runOrSkip(`찬성 투표(${email})`, () => portfolioService.vote(userIds[email], draft.id, true));
      }
      activePortfolio = await portfolioService.getActivePortfolio(leaderId);
    }
    console.log(`  ✓ 활성 포트폴리오 id=${activePortfolio.portfolio_id}`);

    console.log('[7/7] 리그 순위 즉시 재계산 (장 시간 무관)...');
    const result = await rankingService.recomputeRankings(season.id);
    console.log(
      `  ✓ 순위 반영 완료 — 개인 ${result.individual.written}건, 팀 ${result.team.written}건`
    );

    console.log('\n=== 더미 데이터 시딩 완료 ===');
    console.table(
      DUMMY_USERS.map((u) => ({
        email: u.email,
        nickname: u.nickname,
        school: u.school || '(없음)',
        school_is_verified: u.verified,
        team: ['dummy.leader@test.com', 'dummy.member1@test.com', 'dummy.member2@test.com'].includes(u.email)
          ? TEAM_NAME
          : '(없음)',
      }))
    );
    console.log(`\n팀 가입코드(${TEAM_NAME}): ${team.join_code}`);

    // provider=local 계정이라 실제 소셜 로그인으로는 못 들어감 — Postman 등에서 바로 쓸 수 있게
    // 실제 로그인과 동일한 방식(signAccessToken)으로 액세스 토큰을 발급해 출력한다.
    if (process.env.SEED_PRINT_ACCESS_TOKENS === 'true') {
      console.log('\n=== 테스트용 액세스 토큰 (Authorization: Bearer <token>) ===');
      const tokenRows = [];
      for (const u of DUMMY_USERS.filter((u) => u.verified)) {
        const [[row]] = await pool.query('SELECT id, role FROM Users WHERE email = ?', [u.email]);
        const accessToken = signAccessToken({ userId: row.id, role: row.role });
        tokenRows.push({ email: u.email, userId: row.id, accessToken });
      }
      console.table(tokenRows.map(({ email, userId }) => ({ email, userId })));
      tokenRows.forEach(({ email, accessToken }) => console.log(`${email}:\n${accessToken}\n`));
    }

    process.exitCode = 0;
  } catch (err) {
    console.error('더미 데이터 시딩 실패:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
