/*
community에서 종목게시글에서 필요한, trading에서 필요한 종목조회 기능을 stock 도메인으로 빼놓음
*/

const AppError = require('../../errors/AppError');
const stockRepository = require('./stock.repository');
const chartService = require('./chart.service');

// 종목검색
const searchStocks = async (keyword, limit = 20) => {
    return await stockRepository.search(keyword, limit);
};

// --- 관심종목 (Watchlist) ---

// 목록 + 현재가 (getQuote 실패 종목은 가격 필드 null로 응답 — 목록 자체는 항상 성공)
const getWatchlist = async (userId) => {
    const items = await stockRepository.findWatchlistByUser(userId);
    const settled = await Promise.allSettled(items.map((item) => chartService.getQuote(item.stock_code)));
    return items.map((item, i) => {
        const quote = settled[i].status === 'fulfilled' ? settled[i].value : null;
        if (!quote) console.warn(`[watchlist] 시세 조회 실패: ${item.stock_code} — ${settled[i].reason?.message}`);
        return {
            ...item,
            price: quote?.price ?? null,
            change: quote?.change ?? null,
            changePercent: quote?.changePercent ?? null,
        };
    });
};

const addToWatchlist = async (userId, stockCode) => {
    const stock = await stockRepository.findByCode(stockCode);
    if (!stock || stock.status !== 'ACTIVE') {
        throw new AppError('등록할 수 없는 종목입니다.', 400);
    }
    try {
        await stockRepository.addWatchlist(userId, stockCode);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            throw new AppError('이미 관심종목에 등록된 종목입니다.', 409);
        }
        throw err;
    }
    return { stock_code: stockCode, name: stock.name, market: stock.market };
};

const removeFromWatchlist = async (userId, stockCode) => {
    const removed = await stockRepository.removeWatchlist(userId, stockCode);
    if (!removed) throw new AppError('관심종목에 없는 종목입니다.', 404);
    return { stock_code: stockCode };
};

module.exports = { searchStocks, getWatchlist, addToWatchlist, removeFromWatchlist };