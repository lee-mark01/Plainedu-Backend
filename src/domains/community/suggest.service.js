const suggestRepository = require('./suggest.repository');

// 추천은 팔로우하지 않은 사람만 담으므로 is_following은 항상 false다.
// 그래도 필드를 내려주는 이유: 프론트가 목록에서 바로 팔로우 버튼을 그리고 누른 뒤 상태를
// 뒤집는데, 값이 없으면 undefined를 false로 취급하는 분기를 프론트가 따로 둬야 한다.
//
// shared_interests는 추천 이유다. "관심종목 3개가 겹쳐요" 같은 표시에 쓰라고 내려준다 —
// 근거 없이 사람만 나열하면 왜 이 사람인지 알 수 없다.
const toResponse = (rows) =>
  rows.map((r) => ({
    user_id: r.user_id,
    nickname: r.nickname,
    is_following: false,
    shared_interests: Number(r.shared_interests),
    recent_post_count: Number(r.recent_post_count),
  }));

// 추천할 사람이 없으면 빈 배열이다. 가입 초기나 관심종목을 담지 않은 사용자에게는
// 겹칠 신호가 없어 자연스럽게 비는데, 억지로 아무나 채우면 추천의 의미가 사라진다.
const getSuggestedUsers = async (userId, limit) => {
  const rows = await suggestRepository.findSuggestedUsers(userId, limit);
  return { users: toResponse(rows) };
};

module.exports = { getSuggestedUsers, toResponse };
