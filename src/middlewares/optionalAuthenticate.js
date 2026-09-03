const { verifyAccessToken } = require('../utils/jwt');

// 토큰이 있으면 req.user를 채우고, 없거나 잘못됐으면 그냥 통과시킨다.
//
// 커뮤니티 조회(글 목록·단건·댓글·인기글·팔로우 목록)는 비로그인도 볼 수 있어야 해서
// authenticate를 걸 수 없다. 그런데 차단 필터는 "누가 보는가"를 알아야 동작한다 —
// authenticate가 없으면 로그인한 사용자가 토큰을 보내도 req.user가 비어 차단이 적용되지 않는다.
//
// 토큰이 만료·위조여도 401을 내지 않는 게 핵심이다. 공개 조회를 인증 실패로 막으면
// 비로그인 사용자와 같은 화면을 보여줘야 할 상황에서 에러가 나간다.
// 보호가 필요한 경로는 계속 authenticate를 쓴다.
const optionalAuthenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  try {
    req.user = verifyAccessToken(authHeader.slice(7));
  } catch {
    // 만료·위조 토큰은 비로그인과 같게 취급한다.
  }
  next();
};

module.exports = optionalAuthenticate;
