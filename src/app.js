const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');
const errorHandler = require('./middlewares/errorHandler');

// 도메인 라우터
const authRouter = require('./domains/auth/auth.router');
const authController = require('./domains/auth/auth.controller');
const userRouter = require('./domains/user/user.router');
const learningRouter = require('./domains/learning/learning.router');
const teamRouter = require('./domains/team/team.router');
const tradingRouter = require('./domains/trading/trading.router');
const accountRouter = require('./domains/account/account.router');
const rankingRouter = require('./domains/ranking/ranking.router');
const communityRouter = require('./domains/community/community.router');
const schoolRouter = require('./domains/school/school.router');
const stockRouter = require('./domains/stock/stock.router');
const portfolioRouter = require('./domains/portfolio/portfolio.router');

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
app.use('/api/accounts', accountRouter);
app.use('/api/ranking', rankingRouter);
app.use('/api/community', communityRouter);
app.use('/api/schools', schoolRouter);
app.use('/api/stocks', stockRouter);
app.use('/api/portfolios', portfolioRouter);

// API 문서 (Swagger UI) — 스펙 원본은 docs/openapi.yaml.
// 파일이 없어도 서버는 떠야 하므로 문서만 건너뛴다 (Docker 이미지에서 docs/를 뺄 수 있음).
const OPENAPI_PATH = path.join(__dirname, '../docs/openapi.yaml');
if (fs.existsSync(OPENAPI_PATH)) {
  const openapiSpec = yaml.load(fs.readFileSync(OPENAPI_PATH, 'utf8'));
  app.get('/api-docs.json', (req, res) => res.json(openapiSpec)); // Postman/코드젠 임포트용
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, {
      customSiteTitle: 'Plainedu API Docs',
      swaggerOptions: { persistAuthorization: true, docExpansion: 'none', tagsSorter: 'alpha' },
    })
  );
} else {
  console.warn('[swagger] docs/openapi.yaml 없음 — /api-docs 비활성화');
}

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

app.use(errorHandler);

module.exports = app;
