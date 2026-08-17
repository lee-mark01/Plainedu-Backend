const { insert } = require('./sql');

const createAccount = (executor, { type, schoolGroup = 'HIGH_SCHOOL', userId = null, teamId = null, seasonId, cash, equity, rate }) => insert(
  executor,
  `INSERT INTO VirtualAccounts
     (account_type, school_group, user_id, team_id, season_id, initial_cash, cash_balance, total_equity, current_return_rate, active_days)
   VALUES (?, ?, ?, ?, ?, 100000, ?, ?, ?, 12)`,
  [type, schoolGroup, userId, teamId, seasonId, cash, equity, rate]
);

const seedInvestment = async (executor, { qaSessionId, now, users, catalog }) => {
  const joinCode = qaSessionId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const teamId = await insert(
    executor,
    `INSERT INTO Teams (school_id, name, join_code, max_member_count, current_member_count)
     VALUES (?, ?, ?, 4, 3)`,
    [catalog.schoolId, `QA 알파팀 ${qaSessionId.slice(0, 4)}`, joinCode]
  );
  await executor.query(
    `INSERT INTO TeamMembers (team_id, user_id, role) VALUES
       (?, ?, 'LEADER'), (?, ?, 'MEMBER'), (?, ?, 'MEMBER')`,
    [teamId, users[0].id, teamId, users[1].id, teamId, users[2].id]
  );

  const portfolioId = await insert(
    executor,
    `INSERT INTO Portfolios
       (team_id, type, proposed_by, title, description, analysis, approval_count, status)
     VALUES (?, 'NEW', ?, ?, ?, ?, 2, 'APPROVED')`,
    [teamId, users[1].id, 'QA 성장주 포트폴리오', 'QA 승인 완료 포트폴리오', 'QA 분석 근거']
  );
  await executor.query(
    'INSERT INTO TeamActivePortfolios (team_id, portfolio_id, weekly_update_count) VALUES (?, ?, 1)',
    [teamId, portfolioId]
  );
  await executor.query(
    `INSERT INTO PortfolioAllocations (portfolio_id, stock_code, target_percentage, reason) VALUES
       (?, 'AAPL', 40, 'QA 대형주'), (?, 'MSFT', 35, 'QA 클라우드'), (?, 'NVDA', 25, 'QA 반도체')`,
    [portfolioId, portfolioId, portfolioId]
  );
  await executor.query(
    `INSERT INTO PortfolioVotes (portfolio_id, voter_id, is_approved) VALUES (?, ?, TRUE), (?, ?, TRUE)`,
    [portfolioId, users[0].id, portfolioId, users[2].id]
  );

  const accountIds = [];
  for (const [index, user] of users.entries()) {
    accountIds.push(await createAccount(executor, {
      type: 'INDIVIDUAL', userId: user.id, seasonId: catalog.seasonId,
      cash: 70000 - index * 1000, equity: 105000 - index * 1500, rate: 5 - index * 1.5,
    }));
  }
  const teamAccountId = await createAccount(executor, {
    type: 'TEAM', teamId, seasonId: catalog.seasonId, cash: 60000, equity: 108000, rate: 8,
  });

  await executor.query(
    `INSERT INTO AccountAssetHistories (account_id, recorded_at, total_equity, return_rate) VALUES
       (?, ?, 102000, 2), (?, ?, 105000, 5), (?, ?, 108000, 8)`,
    [accountIds[0], new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10), accountIds[0], new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10), accountIds[0], now.toISOString().slice(0, 10)]
  );
  await executor.query(
    `INSERT INTO AccountHoldings (account_id, stock_code, quantity, average_buy_price) VALUES
       (?, 'AAPL', 10, 190), (?, 'MSFT', 6, 420), (?, 'NVDA', 12, 125)`,
    [accountIds[0], accountIds[0], teamAccountId]
  );

  const completedOrderId = await insert(
    executor,
    `INSERT INTO Orders
       (account_id, trader_id, stock_code, order_type, price_type, order_quantity, executed_price, executed_quantity, status, completed_at)
     VALUES (?, ?, 'AAPL', 'BUY', 'MARKET', 10, 190, 10, 'COMPLETED', ?)`,
    [accountIds[0], users[0].id, now]
  );
  await executor.query(
    `INSERT INTO Orders
       (account_id, trader_id, stock_code, order_type, price_type, order_price, order_quantity, status)
     VALUES (?, ?, 'MSFT', 'BUY', 'LIMIT', 390, 2, 'PENDING'),
            (?, ?, 'NVDA', 'SELL', 'LIMIT', 160, 1, 'FAILED')`,
    [accountIds[0], users[0].id, teamAccountId, users[0].id]
  );
  await executor.query(
    `INSERT INTO OrderExecutionLogs (order_id, executed_price, executed_quantity, trading_fee, execution_amount)
     VALUES (?, 190, 10, 0, 1900)`,
    [completedOrderId]
  );
  await executor.query(
    "INSERT INTO Watchlist (user_id, stock_code) VALUES (?, 'AAPL'), (?, 'NVDA')",
    [users[0].id, users[0].id]
  );

  return { teamId, portfolioId, accountIds, teamAccountId };
};

module.exports = { seedInvestment };
