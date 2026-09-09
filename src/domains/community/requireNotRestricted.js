const AppError = require('../../errors/AppError');
const restrictionRepository = require('./restriction.repository');

// 이용 제한 중인 사용자의 커뮤니티 활동을 막는다. authenticate 다음에 붙인다.
//
// 무엇을 막는가: **다른 사람에게 보이는 콘텐츠·상호작용의 생산**이다.
//   막음  — 글·댓글 작성과 수정, 좋아요, 팔로우
//   허용  — 조회 전부, 삭제(자기 글 정리는 막을 이유가 없다), 북마크(개인 저장),
//           조회수, 신고·차단(제한된 사용자도 자기 보호는 해야 한다)
//
// 토큰에 제한 여부를 넣지 않고 매 요청 DB를 보는 이유: 제재는 즉시 적용돼야 한다.
// 토큰에 담으면 발급 시점 값이 굳어 제재 후에도 만료까지 활동할 수 있다.
// 인덱스가 (user_id, status, ends_at)이라 조회는 가볍고, 대상은 쓰기 경로뿐이다.
const requireNotRestricted = async (req, res, next) => {
  try {
    const active = await restrictionRepository.findActiveByUserId(req.user.userId);
    if (!active) return next();

    // 언제까지인지 알려준다 — 사유만 주면 사용자가 언제 풀리는지 알 수 없다.
    const until = active.ends_at ? new Date(active.ends_at).toISOString() : null;
    return next(
      new AppError(
        until
          ? '커뮤니티 이용이 제한된 상태입니다. 제한 내역에서 기간을 확인해주세요.'
          : '커뮤니티 이용이 무기한 제한된 상태입니다. 이의신청은 제한 내역에서 할 수 있습니다.',
        403,
        'COMMUNITY_RESTRICTED'
      )
    );
  } catch (err) {
    next(err);
  }
};

module.exports = requireNotRestricted;
