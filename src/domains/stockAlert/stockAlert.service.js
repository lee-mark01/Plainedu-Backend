const AppError = require('../../errors/AppError');
const { withTransaction } = require('../../config/db');
const stockAlertRepository = require('./stockAlert.repository');

// threshold는 DECIMAL이라 드라이버가 문자열로 주기도 한다. 프론트가 숫자로 받길 기대하므로
// 여기서 한 번 맞춰 내린다.
const toResponse = (stock_code, rows) => ({
  stock_code,
  alerts: rows.map((r) => ({
    type: r.type,
    threshold: Number(r.threshold),
    is_enabled: Boolean(r.is_enabled),
    updated_at: r.updated_at,
  })),
});

const requireStock = async (stock_code) => {
  if (!(await stockAlertRepository.stockExists(stock_code))) {
    throw new AppError('존재하지 않는 종목입니다.', 404, 'STOCK_NOT_FOUND');
  }
};

const getAlerts = async (userId, stock_code) => {
  await requireStock(stock_code);
  const rows = await stockAlertRepository.findByUserAndStock(userId, stock_code);
  return toResponse(stock_code, rows);
};

// 요청에 담긴 집합이 곧 그 종목의 전체 설정이다. 같은 body를 다시 보내면 같은 결과가 되고
// (멱등), 빈 배열을 보내면 그 종목의 알림이 전부 해제된다.
const saveAlerts = async (userId, stock_code, alerts) => {
  await requireStock(stock_code);

  return withTransaction(async (conn) => {
    await stockAlertRepository.replaceForStock(userId, stock_code, alerts, conn);
    const rows = await stockAlertRepository.findByUserAndStock(userId, stock_code, conn);
    return toResponse(stock_code, rows);
  });
};

// 같은 기기에서 다시 등록하면 소유자·플랫폼만 갱신된다(멱등). 앱은 토큰이 갱신될 때마다
// 호출하므로 매번 새 행이 쌓이면 한 번 보낼 때 여러 번 발송된다.
const registerPushToken = async (userId, token, platform) => {
  await stockAlertRepository.upsertPushToken(userId, token, platform);
  return { registered: true, platform };
};

module.exports = { getAlerts, saveAlerts, registerPushToken };
