/*
community에서 종목게시글에서 필요한, trading에서 필요한 종목조회 기능을 stock 도메인으로 빼놓음
*/

const stockRepository = require('./stock.repository');

// 종목검색
const searchStocks = async (keyword, limit = 20) => {
    return await stockRepository.search(keyword, limit);
};

module.exports = { searchStocks };