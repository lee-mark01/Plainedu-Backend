const learningRepository = require('./learning.repository');
const { withTransaction } = require('../../config/db');
const AppError = require('../../errors/AppError');

// =============================================================================
// 1. 학습 메인 (주제 목록 + 진행현황 + 오늘의 플로우 + 레벨)
// =============================================================================

const TODAY_FLOW_TOTAL_STEPS = 3;  // 숏폼 / 퀴즈 / 모의투자 (마지막은 MVP 미구현)

const getTopicsWithProgress = async (userId, levelNumber) => {
  // 독립적인 세 쿼리를 병렬 실행.
  const [topics, learningDays, todayFlow] = await Promise.all([
    learningRepository.findAllTopicsWithProgress(userId, levelNumber),
    learningRepository.findTotalLearningDays(userId),
    learningRepository.findTodayFlowSummary(userId),
  ]);

  const { total_learning_days, consecutive_days } = learningDays;
  const level = calculateLevel(total_learning_days);

  // 오늘 완료한 단계 수 = step1_done + step2_done (+ step3는 미구현 = 0)
  const completedStepsToday = Number(todayFlow.step1_done) + Number(todayFlow.step2_done);

  // 출석은 명시적인 POST /attendance/check-in 으로 분리됨 (GET에 부수 효과 제거).

  return {
    levelNumber,
    topics: topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      levelNumber: topic.level_number,
      sortOrder: topic.sort_order,
      shortformProgress: {
        total: topic.total_shortforms,
        completed: topic.completed_shortforms,
      },
      quizProgress: {
        total: topic.total_quizzes,
        correct: topic.correct_quizzes,
      },
      isShortformDone: Boolean(topic.is_shortform_done),
      isQuizDone: Boolean(topic.is_quiz_done),
    })),
    todayFlow: {
      // 오늘 완료한 학습 단계 수 / 전체 단계 수. 매일 자동 0으로 초기화 (created_at 기준).
      completedSteps: completedStepsToday,
      totalSteps: TODAY_FLOW_TOTAL_STEPS,
    },
    level: {
      current: level,
      totalLearningDays: total_learning_days,
      consecutiveDays: consecutive_days,
    },
  };
};

// =============================================================================
// 2. 숏폼 목록
// =============================================================================

const getShortformsByTopic = async (userId, topicId) => {
  // 주제 존재 확인
  const topic = await learningRepository.findTopicById(topicId);
  if (!topic) {
    throw new AppError('존재하지 않는 학습 주제입니다.', 404, 'TOPIC_NOT_FOUND');
  }

  const shortforms = await learningRepository.findShortformsByTopic(userId, topicId);

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    shortforms: shortforms.map((sf) => ({
      id: sf.id,
      title: sf.title,
      description: sf.description,
      videoUrl: sf.video_url,
      sortOrder: sf.sort_order,
      isCompleted: Boolean(sf.is_completed),
      isLiked: Boolean(sf.is_liked),
      isSaved: Boolean(sf.is_saved),
    })),
  };
};

// =============================================================================
// 3. 숏폼 시청 완료
// =============================================================================

const completeShortform = async (userId, shortformId) => {
  // 숏폼 존재 확인
  const shortform = await learningRepository.findShortformById(shortformId);
  if (!shortform) {
    throw new AppError('존재하지 않는 숏폼입니다.', 404, 'SHORTFORM_NOT_FOUND');
  }

  // 시청 완료 + 진행률 갱신을 하나의 트랜잭션으로 묶음
  await withTransaction(async (conn) => {
    await learningRepository.upsertShortformComplete(userId, shortformId, conn);

    // 해당 주제의 모든 숏폼을 완료했는지 확인 → UserProgress 업데이트
    const allCompleted = await learningRepository.checkAllShortformsCompleted(userId, shortform.topic_id, conn);
    if (allCompleted) {
      await learningRepository.upsertProgressShortformDone(userId, shortform.topic_id, conn);
    }
  });
};

// =============================================================================
// 4. 숏폼 좋아요 토글
// =============================================================================

const toggleLike = async (userId, shortformId) => {
  const shortform = await learningRepository.findShortformById(shortformId);
  if (!shortform) {
    throw new AppError('존재하지 않는 숏폼입니다.', 404, 'SHORTFORM_NOT_FOUND');
  }

  // 토글(UPSERT) + 결과 조회를 한 트랜잭션으로 묶어
  // 사용자가 받는 응답이 자기 토글 직후 상태를 정확히 반영하도록 보장.
  return await withTransaction(async (conn) => {
    await learningRepository.upsertShortformLike(userId, shortformId, conn);
    const log = await learningRepository.findUserShortformLog(userId, shortformId, conn);
    return { isLiked: Boolean(log?.is_liked) };
  });
};

// =============================================================================
// 5. 숏폼 저장 토글
// =============================================================================

const toggleSave = async (userId, shortformId) => {
  const shortform = await learningRepository.findShortformById(shortformId);
  if (!shortform) {
    throw new AppError('존재하지 않는 숏폼입니다.', 404, 'SHORTFORM_NOT_FOUND');
  }

  // 토글(UPSERT) + 결과 조회를 한 트랜잭션으로 묶음 (toggleLike와 동일 이유).
  return await withTransaction(async (conn) => {
    await learningRepository.upsertShortformSave(userId, shortformId, conn);
    const log = await learningRepository.findUserShortformLog(userId, shortformId, conn);
    return { isSaved: Boolean(log?.is_saved) };
  });
};

// =============================================================================
// 6. 퀴즈 문제 조회
// =============================================================================

const getQuizzesByTopic = async (userId, topicId) => {
  const topic = await learningRepository.findTopicById(topicId);
  if (!topic) {
    throw new AppError('존재하지 않는 학습 주제입니다.', 404, 'TOPIC_NOT_FOUND');
  }

  // 숏폼을 먼저 완료해야 퀴즈 접근 가능.
  // completeShortform이 마지막 숏폼 완료 시 upsertProgressShortformDone을 호출하므로
  // UserProgress.is_shortform_done이 진실의 출처. 별도 재확인 불필요.
  const progress = await learningRepository.findUserProgress(userId, topicId);
  if (!progress?.is_shortform_done) {
    throw new AppError('숏폼 학습을 먼저 완료해주세요.', 403, 'SHORTFORM_NOT_COMPLETED');
  }

  const quizzes = await learningRepository.findQuizzesByTopic(topicId);

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    quizzes: quizzes.map((quiz) => ({
      id: quiz.id,
      type: quiz.type,
      difficulty: quiz.difficulty,
      questionData: quiz.question_data,
      sortOrder: quiz.sort_order,
    })),
  };
};

// =============================================================================
// 7-1. 퀴즈 단건 채점 (1문제 풀이 후 즉시 채점)
// =============================================================================

const submitQuizAnswer = async (userId, quizId, userAnswer) => {
  const quiz = await learningRepository.findQuizAnswerById(quizId);
  if (!quiz) {
    throw new AppError('존재하지 않는 퀴즈입니다.', 404, 'QUIZ_NOT_FOUND');
  }

  const answerData = typeof quiz.answer_data === 'string'
    ? JSON.parse(quiz.answer_data)
    : quiz.answer_data;

  const isCorrect = gradeAnswer(quiz.type, answerData, userAnswer);

  // 풀이 로그는 단건 INSERT (재도전 허용 — 같은 quiz_id 여러 row 가능).
  await learningRepository.insertQuizLog(userId, quizId, isCorrect);

  return {
    quizId,
    isCorrect,
    answerData,  // 정답/해설 등 기획팀이 정의한 구조 그대로 노출
  };
};

// =============================================================================
// 7-2. 퀴즈 세션 완료 (모든 문제 풀이 후 결과 페이지)
// =============================================================================

const completeQuizSession = async (userId, topicId) => {
  const topic = await learningRepository.findTopicById(topicId);
  if (!topic) {
    throw new AppError('존재하지 않는 학습 주제입니다.', 404, 'TOPIC_NOT_FOUND');
  }

  const summary = await learningRepository.findQuizSummaryByTopic(userId, topicId);

  if (summary.total === 0) {
    throw new AppError('해당 주제에 퀴즈가 없습니다.', 404, 'QUIZ_NOT_FOUND');
  }

  // 모든 퀴즈를 한 번씩은 풀어야 완료 가능
  if (summary.attempted < summary.total) {
    throw new AppError(
      `아직 풀지 않은 문제가 있습니다. (${summary.attempted}/${summary.total})`,
      400,
      'QUIZ_NOT_FINISHED'
    );
  }

  // UserProgress 갱신
  await learningRepository.upsertProgressQuizDone(userId, topicId, summary.correct, summary.total);

  const score = Math.round((summary.correct / summary.total) * 100);

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    totalQuestions: summary.total,
    correctCount: summary.correct,
    score,
    message: getScoreMessage(score),
  };
};

// =============================================================================
// 8. 월별 출석 조회
// =============================================================================

/**
 * 최근 7일(오늘 포함) 출석 체크리스트 + 연속학습일.
 * 칭찬 화면(퀴즈 완료 후 등)에서 호출.
 */
const getAttendanceStreak = async (userId) => {
  const [weekly, globalLatest] = await Promise.all([
    learningRepository.findWeeklyAttendance(userId),
    learningRepository.findLatestAttendance(userId),
  ]);

  // DB 결과를 Set으로 변환해 O(1) 조회 가능하게.
  // attendance_date가 mysql2 기본 설정에서 JS Date 객체로 오므로 'YYYY-MM-DD' 문자열로 정규화.
  const attendedSet = new Set(weekly.map((r) => formatDate(r.attendance_date)));

  // 오늘부터 -6일까지 7개 슬롯 생성.
  // 날짜는 MySQL 서버 기준이 아닌 JS 기준이라 timezone 이슈 약간 있음.
  // 정확도가 필요해지면 SQL에서 날짜 시리즈를 만들도록 보강.
  const today = new Date();
  const weeklyChecklist = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = formatDate(d);
    weeklyChecklist.push({ date: dateStr, attended: attendedSet.has(dateStr) });
  }

  return {
    consecutiveDays: globalLatest?.consecutive_days || 0,
    totalLearningDays: globalLatest?.total_learning_days || 0,
    weeklyChecklist,
  };
};

const getMonthlyAttendance = async (userId, year, month) => {
  const attendances = await learningRepository.findMonthlyAttendance(userId, year, month);

  // 해당 월의 출석 날짜 목록
  const attendanceDates = attendances.map((a) => a.attendance_date);

  // 연속/총 학습일은 조회 중인 월과 무관하게 "유저의 현재 누적 상태"를 보여준다.
  // → 사용자가 과거 월을 보더라도 화면 상단에는 '지금 기준'의 카운트를 노출.
  const globalLatest = await learningRepository.findLatestAttendance(userId);

  return {
    year,
    month,
    attendanceDates,
    totalDays: attendances.length,
    consecutiveDays: globalLatest?.consecutive_days || 0,
    totalLearningDays: globalLatest?.total_learning_days || 0,
  };
};

// =============================================================================
// 내부 헬퍼 함수
// =============================================================================

/**
 * 퀴즈 채점 함수
 * @param {string} type - CHOICE, OX, MATCH, SHORT
 * @param {object} answerData - DB에 저장된 정답 데이터
 * @param {*} userAnswer - 유저가 제출한 답
 * @returns {boolean}
 */
const gradeAnswer = (type, answerData, userAnswer) => {
  switch (type) {
    case 'CHOICE': {
      // answerData: { answer: 2 } (선택지 번호)
      return Number(userAnswer) === Number(answerData.answer);
    }
    case 'OX': {
      // answerData: { answer: "O" } or { answer: "X" }
      return String(userAnswer).toUpperCase() === String(answerData.answer).toUpperCase();
    }
    case 'MATCH': {
      // answerData: { answer: ["A-1", "B-2", "C-3"] } (매칭 쌍)
      if (!Array.isArray(userAnswer) || !Array.isArray(answerData.answer)) return false;
      if (userAnswer.length !== answerData.answer.length) return false;
      const sortedCorrect = [...answerData.answer].sort();
      const sortedUser = [...userAnswer].sort();
      return sortedCorrect.every((val, idx) => val === sortedUser[idx]);
    }
    case 'SHORT': {
      // answerData: { answer: "역" } or { answer: ["역", "반대"] } (복수 정답 허용)
      const correctAnswers = Array.isArray(answerData.answer)
        ? answerData.answer
        : [answerData.answer];
      const normalized = String(userAnswer).trim().toLowerCase();
      return correctAnswers.some(
        (correct) => String(correct).trim().toLowerCase() === normalized
      );
    }
    default:
      return false;
  }
};

/**
 * Date 객체 또는 'YYYY-MM-DD ...' 문자열을 'YYYY-MM-DD'로 정규화.
 * mysql2가 DATE를 JS Date로 변환하기도 하고 string으로 주기도 해서 양쪽 처리.
 */
const formatDate = (value) => {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
};

/**
 * 점수별 메시지
 */
const getScoreMessage = (score) => {
  if (score === 100) return '완벽해요! 🎉';
  if (score >= 80) return '잘했어요! 👏';
  if (score >= 60) return '좋아요! 조금만 더! 💪';
  if (score >= 40) return '아쉬워요! 😅';
  return '다시 도전해보세요! 📚';
};

/**
 * 레벨 계산 (총 학습일수 기반)
 */
const calculateLevel = (totalLearningDays) => {
  if (totalLearningDays >= 100) return 5;
  if (totalLearningDays >= 50) return 4;
  if (totalLearningDays >= 20) return 3;
  if (totalLearningDays >= 7) return 2;
  return 1;
};

/**
 * 출석 체크 및 기록 (학습 메인 진입 시 호출)
 */
const checkAndRecordAttendance = async (userId) => {
  // 조회 + 삽입을 하나의 트랜잭션으로 묶음.
  // 동시 요청 race는 insertAttendance의 ON DUPLICATE KEY UPDATE로 흡수된다
  // (한쪽은 정상 INSERT, 다른 쪽은 last_active_date만 갱신).
  await withTransaction(async (conn) => {
    // 오늘 이미 출석했으면 스킵
    const todayRecord = await learningRepository.findTodayAttendance(userId, conn);
    if (todayRecord) return;

    // 최근 출석 기록에서 연속일 계산
    const latest = await learningRepository.findLatestAttendance(userId, conn);

    let consecutiveDays = 1;
    let totalLearningDays = 1;

    if (latest) {
      totalLearningDays = latest.total_learning_days + 1;

      // MySQL 서버 기준 DATEDIFF(CURDATE(), attendance_date) 결과를 사용.
      // JS Date로 계산하면 timezone/시각 변환에서 어긋날 수 있음.
      if (latest.days_since_last === 1) {
        consecutiveDays = latest.consecutive_days + 1;
      }
      // days_since_last > 1이면 연속 끊김 → consecutiveDays = 1 (이미 초기값)
      // days_since_last === 0은 위 findTodayAttendance에서 이미 early return 되므로 도달 X
    }

    await learningRepository.insertAttendance(userId, consecutiveDays, totalLearningDays, conn);
  });
};

module.exports = {
  getTopicsWithProgress,
  getShortformsByTopic,
  completeShortform,
  toggleLike,
  toggleSave,
  getQuizzesByTopic,
  submitQuizAnswer,
  completeQuizSession,
  getMonthlyAttendance,
  getAttendanceStreak,
  checkAndRecordAttendance,
};
