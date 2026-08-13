const userService = require('./user.service');

// PM-01: 마이페이지 프로필 조회
const getMe = async (req, res, next) => {
  try {
    const profile = await userService.getMyProfile(req.user.userId);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
};

// PM-03: 프로필 편집
const updateMe = async (req, res, next) => {
  try {
    const updated = await userService.updateMyProfile(req.user.userId, req.validated);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

// AUTH-14: 회원 탈퇴
const deleteMe = async (req, res, next) => {
  try {
    await userService.deleteMyAccount(req.user.userId);
    res.json({ success: true, message: '회원 탈퇴가 완료되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMe, updateMe, deleteMe };
