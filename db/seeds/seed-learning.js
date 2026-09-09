// 학습(주제/숏폼/퀴즈) QA 데이터 시딩 스크립트
//
// 사용법:
//   npm run seed:learning
//
// 사전 조건: db/migrations/20260903000001-topics-level-number.js가 적용돼 있어야 함
// (Topics.level_number 컬럼 필요).
//
// 만드는 것:
//   - 레벨 1 주제 3개 / 레벨 2 주제 2개
//   - 주제당 숏폼 2~3개
//   - 주제당 퀴즈 3개 (OX / CHOICE / SHORT 섞음)
//
// 재실행 안전(idempotent). 주제는 title로 찾아 갱신하고, 해당 주제의 숏폼·퀴즈는
// 지웠다 다시 넣는다.
//
// 주의: 숏폼·퀴즈를 지울 때 FK CASCADE로 그 항목에 달린 UserShortformLog /
// UserQuizLog도 함께 지워진다. QA용 스크립트이며 운영 데이터에 쓰지 말 것.
require('dotenv').config();

const pool = require('../../src/config/db');

const TOPICS = [
  {
    title: '주식이 뭔가요',
    levelNumber: 1,
    sortOrder: 1,
    shortforms: [
      {
        title: '회사의 조각을 산다는 것',
        description: '주식 한 주를 사면 그 회사의 주인이 됩니다. 아주 작은 지분이지만요.',
        videoUrl: 'https://cdn.plainedu.org/shortforms/basic-what-is-stock.mp4',
      },
      {
        title: '주가는 왜 오르내릴까',
        description: '사려는 사람이 팔려는 사람보다 많으면 오릅니다. 그게 전부입니다.',
        videoUrl: 'https://cdn.plainedu.org/shortforms/basic-price-moves.mp4',
      },
    ],
    quizzes: [
      {
        type: 'OX',
        difficulty: 'BEGINNER',
        questionData: { question: '주식을 사면 그 회사의 지분을 갖게 된다.' },
        answerData: { answer: 'O', explanation: '주식은 회사의 소유권을 잘게 나눈 것입니다.' },
      },
      {
        type: 'CHOICE',
        difficulty: 'BEGINNER',
        questionData: {
          question: '주가가 오르는 가장 직접적인 이유는?',
          options: ['회사가 광고를 많이 해서', '사려는 사람이 팔려는 사람보다 많아서', '주식 수가 늘어나서', '배당금을 줘서'],
        },
        answerData: { answer: 2, explanation: '가격은 수요와 공급이 만나는 지점에서 정해집니다.' },
      },
      {
        type: 'SHORT',
        difficulty: 'BEGINNER',
        questionData: { question: '회사가 이익의 일부를 주주에게 나눠주는 것을 무엇이라 하나요?' },
        answerData: { answer: ['배당', '배당금'], explanation: '배당(dividend)이라고 합니다.' },
      },
    ],
  },
  {
    title: '캔들차트 읽는 법',
    levelNumber: 1,
    sortOrder: 2,
    shortforms: [
      {
        title: '캔들 하나에 담긴 네 가지 가격',
        description: '시가, 종가, 고가, 저가. 막대 하나가 하루를 요약합니다.',
        videoUrl: 'https://cdn.plainedu.org/shortforms/chart-candle-basics.mp4',
      },
      {
        title: '빨간 캔들과 파란 캔들',
        description: '한국에서는 오르면 빨강, 내리면 파랑입니다. 미국은 반대예요.',
        videoUrl: 'https://cdn.plainedu.org/shortforms/chart-candle-color.mp4',
      },
      {
        title: '거래량은 왜 같이 볼까',
        description: '가격이 움직인 이유에 힘이 실렸는지 알려줍니다.',
        videoUrl: 'https://cdn.plainedu.org/shortforms/chart-volume.mp4',
      },
    ],
    quizzes: [
      {
        type: 'CHOICE',
        difficulty: 'BEGINNER',
        questionData: {
          question: '캔들 하나가 담고 있지 않은 것은?',
          options: ['시가', '종가', '고가', '배당수익률'],
        },
        answerData: { answer: 4, explanation: '캔들은 시가·종가·고가·저가 네 가지 가격만 담습니다.' },
      },
      {
        type: 'OX',
        difficulty: 'BEGINNER',
        questionData: { question: '한국 증시에서 파란 캔들은 그날 주가가 내렸다는 뜻이다.' },
        answerData: { answer: 'O', explanation: '한국은 상승이 빨강, 하락이 파랑입니다. 미국은 반대입니다.' },
      },
      {
        type: 'SHORT',
        difficulty: 'INTERMEDIATE',
        questionData: { question: '하루 동안 체결된 주식 수를 무엇이라 하나요?' },
        answerData: { answer: ['거래량'], explanation: '거래량은 가격 움직임에 실린 힘을 보여줍니다.' },
      },
    ],
  },
  {
    title: '분산투자가 필요한 이유',
    levelNumber: 1,
    sortOrder: 3,
    shortforms: [
      {
        title: '한 종목에 다 넣으면 생기는 일',
        description: '그 회사 하나의 사고가 내 자산 전부의 사고가 됩니다.',
        videoUrl: 'https://cdn.plainedu.org/shortforms/risk-concentration.mp4',
      },
      {
        title: '몇 개로 나누는 게 좋을까',
        description: '무작정 늘린다고 좋아지지는 않습니다.',
        videoUrl: 'https://cdn.plainedu.org/shortforms/risk-how-many.mp4',
      },
    ],
    quizzes: [
      {
        type: 'OX',
        difficulty: 'BEGINNER',
        questionData: { question: '여러 종목에 나눠 담으면 한 종목이 급락했을 때의 충격이 줄어든다.' },
        answerData: { answer: 'O', explanation: '이것이 분산투자의 핵심입니다.' },
      },
      {
        type: 'CHOICE',
        difficulty: 'INTERMEDIATE',
        questionData: {
          question: '분산투자 효과가 가장 작은 조합은?',
          options: ['같은 업종 반도체주 5개', '서로 다른 5개 업종', '주식과 채권', '국내주와 해외주'],
        },
        answerData: { answer: 1, explanation: '같이 움직이는 자산을 모으면 나눈 의미가 줄어듭니다.' },
      },
      {
        type: 'SHORT',
        difficulty: 'INTERMEDIATE',
        questionData: { question: '한 바구니에 담지 않고 여러 자산에 나눠 담는 전략을 무엇이라 하나요?' },
        answerData: { answer: ['분산투자', '분산 투자'], explanation: '분산투자(diversification)입니다.' },
      },
    ],
  },
  {
    title: '재무제표 훑어보기',
    levelNumber: 2,
    sortOrder: 1,
    shortforms: [
      {
        title: '손익계산서는 성적표',
        description: '한 해 동안 얼마 벌고 얼마 썼는지 보여줍니다.',
        videoUrl: 'https://cdn.plainedu.org/shortforms/fs-income-statement.mp4',
      },
      {
        title: '재무상태표는 건강검진표',
        description: '지금 무엇을 갖고 있고 얼마를 빚졌는지 보여줍니다.',
        videoUrl: 'https://cdn.plainedu.org/shortforms/fs-balance-sheet.mp4',
      },
    ],
    quizzes: [
      {
        type: 'CHOICE',
        difficulty: 'INTERMEDIATE',
        questionData: {
          question: '회사가 한 해 동안 낸 이익을 확인하려면 어떤 표를 봐야 하나요?',
          options: ['재무상태표', '손익계산서', '현금흐름표', '주주명부'],
        },
        answerData: { answer: 2, explanation: '손익계산서가 매출과 이익을 보여줍니다.' },
      },
      {
        type: 'OX',
        difficulty: 'INTERMEDIATE',
        questionData: { question: '재무상태표의 자산은 항상 부채와 자본의 합과 같다.' },
        answerData: { answer: 'O', explanation: '자산 = 부채 + 자본. 회계의 기본 등식입니다.' },
      },
      {
        type: 'SHORT',
        difficulty: 'ADVANCED',
        questionData: { question: '매출에서 모든 비용과 세금을 뺀 최종 이익을 무엇이라 하나요?' },
        answerData: { answer: ['당기순이익', '순이익'], explanation: '당기순이익입니다.' },
      },
    ],
  },
  {
    title: 'PER과 PBR로 비교하기',
    levelNumber: 2,
    sortOrder: 2,
    shortforms: [
      {
        title: 'PER, 몇 년치 이익인가',
        description: '지금 주가가 이익의 몇 배인지 보는 지표입니다.',
        videoUrl: 'https://cdn.plainedu.org/shortforms/valuation-per.mp4',
      },
      {
        title: 'PBR, 장부보다 비싼가',
        description: '회사가 가진 순자산 대비 주가가 어디쯤인지 봅니다.',
        videoUrl: 'https://cdn.plainedu.org/shortforms/valuation-pbr.mp4',
      },
    ],
    quizzes: [
      {
        type: 'CHOICE',
        difficulty: 'INTERMEDIATE',
        questionData: {
          question: 'PER은 무엇을 무엇으로 나눈 값인가요?',
          options: ['주가 ÷ 주당순이익', '주가 ÷ 주당순자산', '순이익 ÷ 매출', '부채 ÷ 자본'],
        },
        answerData: { answer: 1, explanation: 'PER = 주가 ÷ 주당순이익(EPS)입니다.' },
      },
      {
        type: 'OX',
        difficulty: 'ADVANCED',
        questionData: { question: 'PER이 낮으면 무조건 좋은 종목이다.' },
        answerData: {
          answer: 'X',
          explanation: '성장이 멈췄거나 일회성 이익이 컸을 때도 PER은 낮아집니다. 업종 평균과 함께 봐야 합니다.',
        },
      },
      {
        type: 'SHORT',
        difficulty: 'ADVANCED',
        questionData: { question: '주가를 주당순자산으로 나눈 지표를 무엇이라 하나요?' },
        answerData: { answer: ['PBR'], explanation: 'PBR(주가순자산비율)입니다.' },
      },
    ],
  },
];

const upsertTopic = async (conn, topic) => {
  // Topics에는 title 유니크 키가 없어 ON DUPLICATE KEY를 못 쓴다. 먼저 찾고 없으면 넣는다.
  const [found] = await conn.query('SELECT id FROM Topics WHERE title = ? LIMIT 1', [topic.title]);
  if (found.length > 0) {
    await conn.query('UPDATE Topics SET level_number = ?, sort_order = ? WHERE id = ?', [
      topic.levelNumber,
      topic.sortOrder,
      found[0].id,
    ]);
    return found[0].id;
  }

  const [result] = await conn.query(
    'INSERT INTO Topics (title, level_number, sort_order) VALUES (?, ?, ?)',
    [topic.title, topic.levelNumber, topic.sortOrder]
  );
  return result.insertId;
};

const replaceChildren = async (conn, topicId, topic) => {
  // 재실행 시 상태가 누적되지 않도록 이 주제의 숏폼·퀴즈만 갈아끼운다.
  await conn.query('DELETE FROM ShortForms WHERE topic_id = ?', [topicId]);
  await conn.query('DELETE FROM Quizzes WHERE topic_id = ?', [topicId]);

  for (const [idx, sf] of topic.shortforms.entries()) {
    await conn.query(
      'INSERT INTO ShortForms (topic_id, title, description, video_url, sort_order) VALUES (?, ?, ?, ?, ?)',
      [topicId, sf.title, sf.description, sf.videoUrl, idx + 1]
    );
  }

  for (const [idx, quiz] of topic.quizzes.entries()) {
    await conn.query(
      'INSERT INTO Quizzes (topic_id, type, difficulty, question_data, answer_data, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [
        topicId,
        quiz.type,
        quiz.difficulty,
        JSON.stringify(quiz.questionData),
        JSON.stringify(quiz.answerData),
        idx + 1,
      ]
    );
  }
};

(async () => {
  const conn = await pool.getConnection();
  try {
    const summary = [];

    for (const topic of TOPICS) {
      const topicId = await upsertTopic(conn, topic);
      await replaceChildren(conn, topicId, topic);
      summary.push({
        id: topicId,
        title: topic.title,
        level: topic.levelNumber,
        shortforms: topic.shortforms.length,
        quizzes: topic.quizzes.length,
      });
    }

    console.log('학습 QA 데이터 시딩 완료');
    console.table(summary);
    console.log('확인: GET /api/learning/topics?level=1, GET /api/learning/topics/{id}/quizzes');
    process.exitCode = 0;
  } catch (err) {
    console.error('학습 QA 데이터 시딩 실패:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
})();
