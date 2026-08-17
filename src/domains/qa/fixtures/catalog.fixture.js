const { insert, rows } = require('./sql');

const quarter = (now) => {
  const month = now.getUTCMonth();
  const startMonth = Math.floor(month / 3) * 3;
  const start = new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), startMonth + 3, 0));
  return {
    name: `QA ${now.getUTCFullYear()} Q${Math.floor(month / 3) + 1}`,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    days: Math.floor((end - start) / 86_400_000) + 1,
  };
};

const ensureCatalog = async (executor, { now }) => {
  await executor.query(
    `INSERT INTO schools (school_name, region, school_group)
     VALUES (?, ?, 'HIGH_SCHOOL')
     ON DUPLICATE KEY UPDATE school_group = VALUES(school_group)`,
    ['QA 테스트고등학교', 'QA']
  );
  const [school] = await rows(
    executor,
    'SELECT id FROM schools WHERE school_name = ? AND region = ? LIMIT 1',
    ['QA 테스트고등학교', 'QA']
  );

  for (const stock of [
    ['AAPL', 'Apple', 'NASDAQ'],
    ['MSFT', 'Microsoft', 'NASDAQ'],
    ['NVDA', 'NVIDIA', 'NASDAQ'],
  ]) {
    await executor.query(
      `INSERT INTO Stocks (stock_code, name, market, currency, status)
       VALUES (?, ?, ?, 'USD', 'ACTIVE')
       ON DUPLICATE KEY UPDATE name = VALUES(name), status = 'ACTIVE'`,
      stock
    );
  }

  let [season] = await rows(executor, "SELECT id FROM Seasons WHERE status = 'ACTIVE' LIMIT 1");
  if (!season) {
    const value = quarter(now);
    const id = await insert(
      executor,
      `INSERT INTO Seasons (name, start_date, end_date, total_days, status)
       VALUES (?, ?, ?, ?, 'ACTIVE')`,
      [value.name, value.start, value.end, value.days]
    );
    season = { id };
  }

  let [topic] = await rows(executor, 'SELECT id FROM Topics WHERE title = ? LIMIT 1', ['QA 투자 기초']);
  if (!topic) topic = { id: await insert(executor, 'INSERT INTO Topics (title, level_number, sort_order) VALUES (?, ?, ?)', ['QA 투자 기초', 1, 900]) };
  else await executor.query('UPDATE Topics SET level_number = ? WHERE id = ?', [1, topic.id]);

  let [shortform] = await rows(
    executor,
    'SELECT id FROM ShortForms WHERE topic_id = ? AND title = ? LIMIT 1',
    [topic.id, 'QA 분산투자 이해하기']
  );
  if (!shortform) {
    shortform = { id: await insert(
      executor,
      `INSERT INTO ShortForms (topic_id, title, description, video_url, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [topic.id, 'QA 분산투자 이해하기', 'QA 학습용 숏폼', 'https://qa.invalid/video/diversification.mp4', 1]
    ) };
  }

  let [quiz] = await rows(executor, 'SELECT id FROM Quizzes WHERE topic_id = ? AND sort_order = 1 LIMIT 1', [topic.id]);
  if (!quiz) {
    quiz = { id: await insert(
      executor,
      `INSERT INTO Quizzes (topic_id, type, difficulty, question_data, answer_data, sort_order)
       VALUES (?, 'CHOICE', 'BEGINNER', ?, ?, 1)`,
      [topic.id, JSON.stringify({ question: '분산투자의 목적은?', options: ['위험 분산', '위험 집중'] }), JSON.stringify({ answer: 0 })]
    ) };
  }

  let [incompleteQuiz] = await rows(
    executor,
    'SELECT id FROM Quizzes WHERE topic_id = ? AND sort_order = 2 LIMIT 1',
    [topic.id]
  );
  if (!incompleteQuiz) {
    incompleteQuiz = { id: await insert(
      executor,
      `INSERT INTO Quizzes (topic_id, type, difficulty, question_data, answer_data, sort_order)
       VALUES (?, 'CHOICE', 'BEGINNER', ?, ?, 2)`,
      [topic.id, JSON.stringify({ question: '투자 위험을 줄이는 방법은?', options: ['여러 자산에 분산', '한 종목에 집중'] }), JSON.stringify({ answer: 0 })]
    ) };
  }

  return {
    schoolId: school.id,
    seasonId: season.id,
    topicId: topic.id,
    shortformId: shortform.id,
    quizId: quiz.id,
    incompleteQuizId: incompleteQuiz.id,
  };
};

module.exports = { ensureCatalog };
