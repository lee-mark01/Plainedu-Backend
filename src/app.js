const express = require('express');
const cors = require('cors');
const errorHandler = require('./middlewares/errorHandler');

// 도메인 라우터
const userRouter = require('./domains/user/user.router');
const learningRouter = require('./domains/learning/learning.router');
const teamRouter = require('./domains/team/team.router');
const tradingRouter = require('./domains/trading/trading.router');
const rankingRouter = require('./domains/ranking/ranking.router');
const communityRouter = require('./domains/community/community.router');

const app = express();

app.use(cors());
app.use(express.json());

// 라우터 연결
app.use('/api/users', userRouter);
app.use('/api/learning', learningRouter);
app.use('/api/teams', teamRouter);
app.use('/api/trading', tradingRouter);
app.use('/api/ranking', rankingRouter);
app.use('/api/community', communityRouter);

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

app.use(errorHandler);

module.exports = app;
