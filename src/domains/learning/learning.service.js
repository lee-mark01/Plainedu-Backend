const learningRepository = require('./learning.repository');
const quizAttemptRepository = require('./quizAttempt.repository');
const { withTransaction } = require('../../config/db');
const AppError = require('../../errors/AppError');
const attendanceService = require('../user/attendance.service');

// =============================================================================
// 1. 학습 메인 (주제 목록 + 진행현황 + 오늘의 플로우 + 레벨)
// =============================================================================

const TODAY_FLOW_TOTAL_STEPS = 3;  // 숏폼 / 퀴즈 / 모의투자 (마지막은 MVP 미구현)

const getTopicsWithProgress = async (userId, levelNumber) => {
  // 독립적인 세 쿼리를 병렬 실행.
  const [topics, learningDays, todayFlow] = await Promise.all([
    learningRepository.findAllTopicsWithProgress(userId, levelNumber),
    attendanceService.getLearningDaysSummary(userId),
    learningRepository.findTodayFlowSummary(userId),
  ]);

  const { total_learning_days, consecutive_days } = learningDays;
  const level = calculateLevel(total_learning_days);

  // 오늘 완료한 단계 수 = step1_done + step2_done (+ step3는 미구현 = 0)
  const completedStepsToday = Number(todayFlow.step1_done) + Number(todayFlow.step2_done);

  // 출석은 user 도메인의 POST /api/users/attendance/check-in 으로 분리됨 (GET에 부수 효과 제거, 학습 진입과 무관하게 앱 접속 시 트리거).

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

  // 답안을 응시 회차에 붙인다. 진행 중인 회차가 없으면 이 답안이 회차의 시작이다.
  //
  // 트랜잭션인 이유: 문제 두 개를 거의 동시에 제출하면 두 요청이 모두 "진행 중 회차 없음"을
  // 보고 각자 회차를 만들어, 한 응시가 두 회차로 쪼개진다. 잠금과 생성이 한 단위여야 한다.
  await withTransaction(async (conn) => {
    const open = await quizAttemptRepository.findOpenAttemptForUpdate(userId, quiz.topic_id, conn);
    const attemptId = open
      ? open.id
      : await quizAttemptRepository.createAttempt(userId, quiz.topic_id, conn);

    // 풀이 로그는 단건 INSERT (재도전 허용 — 같은 quiz_id 여러 row 가능).
    await learningRepository.insertQuizLog(userId, quizId, isCorrect, attemptId, conn);
  });

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

  // UserProgress 갱신 — 여기 담기는 건 "현재 상태"(누적)다. 회차 이력은 QuizAttempts가 맡는다.
  await learningRepository.upsertProgressQuizDone(userId, topicId, summary.correct, summary.total);

  const score = Math.round((summary.correct / summary.total) * 100);

  // 진행 중인 회차를 닫는다. 회차 점수는 **이번 응시에서 맞은 개수**로 센다 —
  // 위 summary는 "한 번이라도 정답이면 정답"인 누적 기준이라 재도전 시 두 값이 갈린다.
  // 이력 목록에 "2회차 100점"이 뜨는데 실제로 그 회차엔 한 문제만 맞혔다면 기록이 거짓이 된다.
  //
  // 분모는 그 회차에 푼 문제 수가 아니라 주제의 전체 문제 수(summary.total)다.
  // 회차마다 분모가 달라지면 회차끼리 비교할 수 없고, 안 푼 문제는 못 맞힌 것으로 보는 게 맞다.
  const attempt = await closeCurrentAttempt(userId, topicId, summary.total);

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    totalQuestions: summary.total,
    correctCount: summary.correct,
    score,
    message: getScoreMessage(score),
    // 이번 회차 기준 값. 기존 필드(누적)는 그대로 두고 additive로 추가한다 —
    // 프론트가 완료 화면에서 어느 쪽을 보여줄지 고를 수 있고, 이력 목록과 숫자가 맞는다.
    attempt,
  };
};

// 진행 중인 회차를 집계해 닫는다. 회차가 없으면(답안 없이 완료를 부르거나 이미 닫힌 경우)
// null을 돌려주고 기존 동작만 남는다 — 완료를 두 번 눌러도 점수가 뒤바뀌지 않는다.
const closeCurrentAttempt = async (userId, topicId, totalQuizCount) => {
  return withTransaction(async (conn) => {
    const open = await quizAttemptRepository.findOpenAttemptForUpdate(userId, topicId, conn);
    if (!open) return null;

    const correctCount = await quizAttemptRepository.countCorrectInAttempt(open.id, conn);
    const attemptScore = totalQuizCount > 0
      ? Math.round((correctCount / totalQuizCount) * 100)
      : 0;

    await quizAttemptRepository.completeAttempt(
      open.id,
      { correct_count: correctCount, total_quiz_count: totalQuizCount, score: attemptScore },
      conn
    );

    return {
      attemptId: open.id,
      correctCount,
      totalQuestions: totalQuizCount,
      score: attemptScore,
    };
  });
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

module.exports = {
  getTopicsWithProgress,
  getShortformsByTopic,
  completeShortform,
  toggleLike,
  toggleSave,
  getQuizzesByTopic,
  submitQuizAnswer,
  completeQuizSession,
};
