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

const findByCode = async (stock_code) => {
    const [rows] = await pool.query(
        'SELECT stock_code, name, market, currency, status FROM Stocks WHERE stock_code = ?',
        [stock_code]
    );
    return rows[0] || null;
};

// --- 관심종목 (Watchlist) ---

const findWatchlistByUser = async (user_id) => {
    const [rows] = await pool.query(
        `SELECT w.stock_code, s.name, s.market, w.created_at
         FROM Watchlist w
         JOIN Stocks s ON s.stock_code = w.stock_code
         WHERE w.user_id = ?
         ORDER BY w.created_at DESC`,
        [user_id]
    );
    return rows;
};

const addWatchlist = async (user_id, stock_code) => {
    await pool.query('INSERT INTO Watchlist (user_id, stock_code) VALUES (?, ?)', [user_id, stock_code]);
};

const removeWatchlist = async (user_id, stock_code) => {
    const [result] = await pool.query('DELETE FROM Watchlist WHERE user_id = ? AND stock_code = ?', [
        user_id,
        stock_code,
    ]);
    return result.affectedRows;
};

module.exports = { search, findByCode, findWatchlistByUser, addWatchlist, removeWatchlist };