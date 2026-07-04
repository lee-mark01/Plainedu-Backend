const schoolService = require('./school.service');
const AppError = require('../../errors/AppError');

// POST /api/schools/sync — 커리어넷에서 학교 데이터 동기화 (관리자 전용)
const syncSchools = async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') {
      throw new AppError('관리자만 실행할 수 있습니다.', 403);
    }
    const { gubuns } = req.validated;
    const result = await schoolService.syncSchools(gubuns);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// GET /api/schools — 학교 검색 (회원가입 시 학교 선택 등)
const searchSchools = async (req, res, next) => {
  try {
    const schools = await schoolService.searchSchools(req.validated);
    res.json({ success: true, data: schools });
  } catch (err) {
    next(err);
  }
};

module.exports = { syncSchools, searchSchools };
