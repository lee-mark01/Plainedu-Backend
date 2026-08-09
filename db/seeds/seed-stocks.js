'use strict';

require('dotenv').config();
const axios = require('axios');
const mysql = require('mysql2/promise');

const API_KEY = process.env.TWELVEDATA_API_KEY;
const BASE_URL = 'https://api.twelvedata.com';
const BATCH_SIZE = 500;

if (!API_KEY) {
  console.error('[ERROR] .env에 TWELVEDATA_API_KEY가 없습니다.');
  process.exit(1);
}

async function fetchStocks(exchange) {
  console.log(`[Twelve Data] ${exchange} 종목 목록 요청 중...`);
  const res = await axios.get(`${BASE_URL}/stocks`, {
    params: {
      exchange,
      country: 'United States',
      apikey: API_KEY,
    },
  });

  if (res.data.status === 'error') {
    throw new Error(`Twelve Data 오류: ${res.data.message}`);
  }

  const stocks = res.data.data || [];
  console.log(`[Twelve Data] ${exchange} ${stocks.length}개 수신`);
  return stocks;
}

function toRows(stocks, exchange) {
  return stocks.map((s) => [
    s.symbol,
    s.name,
    exchange,
    s.currency || 'USD',
    'ACTIVE',
  ]);
}

async function seed() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    const [nasdaqStocks, nyseStocks] = await Promise.all([
      fetchStocks('NASDAQ'),
      fetchStocks('NYSE'),
    ]);

    const rows = [
      ...toRows(nasdaqStocks, 'NASDAQ'),
      ...toRows(nyseStocks, 'NYSE'),
    ];

    console.log(`\n총 ${rows.length}개 종목 DB 삽입 시작...`);

    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await pool.query(
        `INSERT IGNORE INTO Stocks (stock_code, name, market, currency, status) VALUES ?`,
        [batch]
      );
      inserted += batch.length;
      process.stdout.write(`\r  진행: ${inserted}/${rows.length}`);
    }

    console.log('\n\n[완료] 시딩 성공');
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
