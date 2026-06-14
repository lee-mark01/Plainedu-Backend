/*
community에서 종목게시글에서 필요한, trading에서 필요한 종목조회 기능을 stock 도메인으로 빼놓음
*/
const pool = require('../../config/db');

// 종목 검색 (종목명 또는 종목 코드)

const search = async (keyword, limit) => {
    const [rows] = await pool.query(
        `SELECT stock_code, name, market FROM Stocks
         WHERE status = 'ACTIVE' 
            AND (name LIKE ? OR stock_code LIKE ?)
            ORDER BY name
            LIMIT ?`,
            [`%${keyword}%`, `%${keyword}%`, limit]
            );
    return rows;
};

module.exports = { search };