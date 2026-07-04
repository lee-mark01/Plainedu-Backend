const express = require('express');
const cors = require('cors');
const errorHandler = require('./middlewares/errorHandler');

// 도메인 라우터
const authRouter = require('./domains/auth/auth.router');
const authController = require('./domains/auth/auth.controller');
const userRouter = require('./domains/user/user.router');
const learningRouter = require('./domains/learning/learning.router');
const teamRouter = require('./domains/team/team.router');
const tradingRouter = require('./domains/trading/trading.router');
const rankingRouter = require('./domains/ranking/ranking.router');
const communityRouter = require('./domains/community/community.router');
const schoolRouter = require('./domains/school/school.router');

const app = express();

app.use(cors());
app.use(express.json());

// 카카오 OAuth 리다이렉트 콜백 (KAKAO_REDIRECT_URI 대응)
app.get('/auth/kakao/callback', authController.kakaoLogin);

// 네이버 OAuth 리다이렉트 콜백 (NAVER_REDIRECT_URI 대응)
app.get('/auth/naver/callback', authController.naverLogin);

// 구글 OAuth 리다이렉트 콜백 (GOOGLE_REDIRECT_URI 대응)
app.get('/auth/google/callback', authController.googleLogin);

// 라우터 연결
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/learning', learningRouter);
app.use('/api/teams', teamRouter);
app.use('/api/trading', tradingRouter);
app.use('/api/ranking', rankingRouter);
app.use('/api/community', communityRouter);
app.use('/api/schools', schoolRouter);

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

app.use(errorHandler);

module.exports = app;
