// 신규 기능(약관·휴대폰·알림설정·차단·신고·제재·가입신청·퀴즈·종목알림) QA 데이터 시딩
//
// 사용법:
//   npm run seed:qa-features        (단독 실행)
//   npm run seed:main-qa            (cleanup → seed-demo → 이 스크립트, CD가 실행)
//
// 사전 조건: seed-demo.js가 먼저 돌아 QA 계정과 팀이 있어야 한다. 계정을 이메일로 찾으므로
// 배포마다 id가 바뀌어도 상관없다.
//
// 왜 seed-demo.js에 넣지 않았나: seed-demo는 투자 코어(계좌·주문·리그)를 만드는 스크립트이고
// 이미 300줄이다. 커뮤니티 운영·설정 데이터는 성격이 달라 따로 두면 각각 단독 실행할 수 있다.
//
// 전부 재실행 안전(idempotent)하다 — 표식으로 이미 있는지 확인하고 없을 때만 넣는다.
// 선행 데이터(Topics·Stocks)가 없으면 그 항목만 건너뛰고 계속한다. 배포 파이프라인에서
// 도는 스크립트라 하나 없다고 전체가 실패하면 안 된다.
require('dotenv').config();

const pool = require('../../src/config/db');
const redis = require('../../src/config/redis');
const { closeSeedResources } = require('./seed-resources');
const { AGREEMENT_VERSIONS } = require('../../src/config/agreements');

const QA_EMAILS = [
  'dummy.leader@test.com',
  'dummy.member1@test.com',
  'dummy.member2@test.com',
  'dummy.solo1@test.com',
  'dummy.solo2@test.com',
  'dummy.unverified@test.com',
  'dummy.noschool@test.com',
  'dummy.admin@test.com',
];

// 표식(제목 등)으로 찾고 없을 때만 넣는다. 만든 id를 다음 단계가 쓰므로 반환한다.
const findOrInsert = async (findSql, findParams, insertSql, insertParams) => {
  const [found] = await pool.query(findSql, findParams);
  if (found.length) return found[0].id;
  const [result] = await pool.query(insertSql, insertParams);
  return result.insertId;
};

const step = async (label, fn) => {
  try {
    const note = await fn();
    console.log(`  ✓ ${label}${note ? ` — ${note}` : ''}`);
  } catch (err) {
    console.log(`  - ${label} 건너뜀 (${err.message})`);
  }
};

(async () => {
  try {
    console.log('[1/9] QA 계정 확인...');
    const [userRows] = await pool.query('SELECT id, email FROM Users WHERE email IN (?)', [QA_EMAILS]);
    const uid = Object.fromEntries(userRows.map((r) => [r.email, r.id]));
    const missing = QA_EMAILS.filter((e) => !uid[e]);
    if (missing.length) {
      throw new Error(`QA 계정이 없습니다: ${missing.join(', ')} — 먼저 "npm run seed:demo"를 실행하세요.`);
    }
    const leader = uid['dummy.leader@test.com'];
    const member1 = uid['dummy.member1@test.com'];
    const solo1 = uid['dummy.solo1@test.com'];
    const solo2 = uid['dummy.solo2@test.com'];
    const unverified = uid['dummy.unverified@test.com'];
    const admin = uid['dummy.admin@test.com'];
    console.log(`  ✓ ${userRows.length}개 계정 확인 (관리자 id=${admin})`);

    // 종목 알림·종목토론글이 참조할 종목. 없으면 그 두 항목만 건너뛴다.
    const [stockRows] = await pool.query(
      "SELECT stock_code FROM Stocks WHERE stock_code IN ('AAPL','NVDA')"
    );
    const hasStocks = stockRows.length === 2;

    // ── 약관 동의 ────────────────────────────────────────────────────────────
    // 프론트가 확인할 것: 온보딩을 마친 계정(필수 동의 완료)과 미완료 계정의 분기.
    // 마케팅만 거부한 상태를 leader에 둔다 — 선택 항목이 필수와 따로 저장되는지 확인용.
    console.log('[2/9] 약관 동의...');
    await step('필수 약관 동의 (leader/member1/solo1/solo2/admin)', async () => {
      const agreed = [leader, member1, solo1, solo2, admin];
      for (const userId of agreed) {
        for (const type of ['TERMS', 'PRIVACY']) {
          await pool.query(
            `INSERT INTO UserAgreements (user_id, type, is_agreed, version, agreed_at)
             VALUES (?, ?, TRUE, ?, NOW())
             ON DUPLICATE KEY UPDATE is_agreed = VALUES(is_agreed), version = VALUES(version)`,
            [userId, type, AGREEMENT_VERSIONS[type]]
          );
        }
      }
      return `${agreed.length}명 x TERMS·PRIVACY`;
    });
    await step('마케팅 거부 (leader)', async () => {
      // is_agreed=false + agreed_at=NULL — 한 번도 동의한 적 없는 상태.
      await pool.query(
        `INSERT INTO UserAgreements (user_id, type, is_agreed, version, agreed_at)
         VALUES (?, 'MARKETING', FALSE, ?, NULL)
         ON DUPLICATE KEY UPDATE is_agreed = VALUES(is_agreed)`,
        [leader, AGREEMENT_VERSIONS.MARKETING]
      );
      return 'is_agreed=false';
    });
    await step('마케팅 동의 (member1/solo1)', async () => {
      for (const userId of [member1, solo1]) {
        await pool.query(
          `INSERT INTO UserAgreements (user_id, type, is_agreed, version, agreed_at)
           VALUES (?, 'MARKETING', TRUE, ?, NOW())
           ON DUPLICATE KEY UPDATE is_agreed = VALUES(is_agreed)`,
          [userId, AGREEMENT_VERSIONS.MARKETING]
        );
      }
      return '2명';
    });
    // noschool은 의도적으로 비워둔다 — 약관 미동의 + 학교 없음 = 온보딩 진입 상태.

    // ── 휴대폰 인증 ──────────────────────────────────────────────────────────
    // 번호는 숫자만 저장한다(phoneVerification.validator가 정규화하는 형태와 같게).
    console.log('[3/9] 휴대폰 인증...');
    await step('인증 완료 (leader)', async () => {
      await pool.query(
        'UPDATE Users SET phone = ?, phone_verified_at = NOW() WHERE id = ?',
        ['01011110001', leader]
      );
      return '01011110001';
    });
    await step('번호만 입력, 미인증 (unverified)', async () => {
      // 인증 유도 화면 확인용 — 번호는 있지만 phone_verified_at이 NULL이다.
      await pool.query(
        'UPDATE Users SET phone = ?, phone_verified_at = NULL WHERE id = ?',
        ['01011110002', unverified]
      );
      return 'phone_verified_at = NULL';
    });

    // ── 알림 수신 설정 ───────────────────────────────────────────────────────
    // 두 항목만 끈다. 나머지는 행이 없어 서버 기본값(켜짐)으로 내려간다 —
    // 요청 14의 "한 항목만 바꿔도 나머지가 초기화되지 않는다"를 화면에서 확인할 수 있다.
    console.log('[4/9] 알림 수신 설정...');
    await step('일부 항목 끔 (leader)', async () => {
      for (const key of ['community.post_like', 'service.notice']) {
        await pool.query(
          `INSERT INTO NotificationPrefs (user_id, pref_key, is_enabled) VALUES (?, ?, FALSE)
           ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled)`,
          [leader, key]
        );
      }
      return 'community.post_like, service.notice = false';
    });

    // ── 게시글·댓글 (신고·차단이 가리킬 대상) ────────────────────────────────
    // solo2가 쓴 글을 leader가 차단한다. 차단 효과를 목록에서 눈으로 확인할 수 있어야
    // 프론트가 필터 동작을 검증할 수 있다.
    console.log('[5/9] 게시글·댓글...');
    let solo2Post = null;
    let solo2Comment = null;
    await step('게시글 3건', async () => {
      const leaderPost = await findOrInsert(
        'SELECT id FROM CommunityPosts WHERE user_id = ? AND title = ?',
        [leader, '[QA] 팀장이 쓴 일반글'],
        `INSERT INTO CommunityPosts (user_id, post_type, stock_code, opinion, title, content)
         VALUES (?, 'GENERAL', NULL, NULL, ?, ?)`,
        [leader, '[QA] 팀장이 쓴 일반글', '차단·신고 테스트용 기준 게시글입니다.']
      );
      solo2Post = await findOrInsert(
        'SELECT id FROM CommunityPosts WHERE user_id = ? AND title = ?',
        [solo2, '[QA] 차단 대상이 쓴 글'],
        `INSERT INTO CommunityPosts (user_id, post_type, stock_code, opinion, title, content)
         VALUES (?, 'GENERAL', NULL, NULL, ?, ?)`,
        [solo2, '[QA] 차단 대상이 쓴 글', '팀장이 이 계정을 차단하면 목록에서 사라져야 합니다.']
      );
      if (hasStocks) {
        await findOrInsert(
          'SELECT id FROM CommunityPosts WHERE user_id = ? AND title = ?',
          [member1, '[QA] AAPL 종목토론'],
          `INSERT INTO CommunityPosts (user_id, post_type, stock_code, opinion, title, content)
           VALUES (?, 'STOCK_DISCUSSION', 'AAPL', 'BUY', ?, ?)`,
          [member1, '[QA] AAPL 종목토론', '종목 상세의 토론 탭 확인용 게시글입니다.']
        );
      }
      return hasStocks
        ? `일반 2건 + 종목토론 1건 (기준글 id=${leaderPost})`
        : `일반 2건 (종목 없어 토론글 생략, 기준글 id=${leaderPost})`;
    });
    await step('댓글 2건 + 카운터 정합', async () => {
      if (!solo2Post) throw new Error('대상 게시글이 없습니다.');
      const memberComment = await findOrInsert(
        'SELECT id FROM CommunityComments WHERE user_id = ? AND content = ?',
        [member1, '[QA] 팀원이 남긴 댓글입니다.'],
        'INSERT INTO CommunityComments (post_id, user_id, parent_id, content) VALUES (?, ?, NULL, ?)',
        [solo2Post, member1, '[QA] 팀원이 남긴 댓글입니다.']
      );
      solo2Comment = await findOrInsert(
        'SELECT id FROM CommunityComments WHERE user_id = ? AND content = ?',
        [solo2, '[QA] 차단 대상이 남긴 댓글입니다.'],
        'INSERT INTO CommunityComments (post_id, user_id, parent_id, content) VALUES (?, ?, NULL, ?)',
        [solo2Post, solo2, '[QA] 차단 대상이 남긴 댓글입니다.']
      );
      // comment_count는 서비스가 관리하는 비정규화 값이다. 직접 INSERT했으므로 맞춰준다 —
      // 안 맞으면 목록에는 "댓글 0"인데 상세에는 댓글이 있는 화면이 된다.
      await pool.query(
        `UPDATE CommunityPosts p
         SET comment_count = (SELECT COUNT(*) FROM CommunityComments c
                              WHERE c.post_id = p.id AND c.deleted_at IS NULL)
         WHERE p.id = ?`,
        [solo2Post]
      );
      return `id=${memberComment}, ${solo2Comment}`;
    });

    // ── 차단 ─────────────────────────────────────────────────────────────────
    console.log('[6/9] 차단...');
    await step('leader → solo2 차단', async () => {
      await pool.query(
        'INSERT IGNORE INTO CommunityBlocks (blocker_id, blocked_id) VALUES (?, ?)',
        [leader, solo2]
      );
      // 단방향 선언, 양방향 가시성: leader의 목록에서 solo2의 글이 사라지고,
      // solo2의 목록에서도 leader의 글이 사라진다. 양쪽 계정으로 확인할 수 있다.
      return '차단 목록 1건';
    });

    // ── 신고 ─────────────────────────────────────────────────────────────────
    // 같은 대상에 2건을 몰아둔다 — 관리자 목록의 target_report_count가 누적으로
    // 표시되는지 확인하려면 1건짜리로는 알 수 없다.
    console.log('[7/9] 신고...');
    await step('신고 3건 (같은 글에 2건 누적)', async () => {
      if (!solo2Post || !solo2Comment) throw new Error('신고 대상이 없습니다.');
      const reports = [
        [leader, 'POST', solo2Post, 'ABUSE', '욕설이 포함되어 있습니다.'],
        [member1, 'POST', solo2Post, 'SPAM', '같은 내용을 반복 게시합니다.'],
        [solo1, 'COMMENT', solo2Comment, 'FALSE_INFO', '사실과 다른 내용입니다.'],
      ];
      for (const [reporter, targetType, targetId, reason, detail] of reports) {
        await pool.query(
          `INSERT IGNORE INTO CommunityReports (reporter_id, target_type, target_id, reason, detail)
           VALUES (?, ?, ?, ?, ?)`,
          [reporter, targetType, targetId, reason, detail]
        );
      }
      return '글 2건(target_report_count=2) + 댓글 1건';
    });

    // ── 이용 제한 + 이의신청 ─────────────────────────────────────────────────
    console.log('[8/9] 이용 제한·이의신청...');
    await step('solo2 커뮤니티 제한 (7일) + 이의신청 접수', async () => {
      // 유효한 제한이 이미 있으면 새로 만들지 않는다 — 조회는 ACTIVE 중 최신 1건을 보므로
      // 재실행마다 쌓이면 관리자 목록만 지저분해진다.
      const restrictionId = await findOrInsert(
        `SELECT id FROM UserRestrictions
         WHERE user_id = ? AND status = 'ACTIVE' AND (ends_at IS NULL OR ends_at > NOW())`,
        [solo2],
        `INSERT INTO UserRestrictions (user_id, reason, detail, ends_at, created_by)
         VALUES (?, 'ABUSE', ?, DATE_ADD(NOW(), INTERVAL 7 DAY), ?)`,
        [solo2, '[QA] 신고 누적으로 부과한 테스트 제한입니다.', admin]
      );
      // UNIQUE(restriction_id) — 제한 건당 이의신청 하나.
      await pool.query(
        `INSERT IGNORE INTO RestrictionAppeals (restriction_id, user_id, content)
         VALUES (?, ?, ?)`,
        [restrictionId, solo2, '[QA] 오해가 있었습니다. 해당 게시글은 인용이었으니 확인 부탁드립니다.']
      );
      return `restriction id=${restrictionId}, 이의신청 RECEIVED`;
    });

    console.log('[9/9] 팀 가입 신청·퀴즈·종목 알림...');
    // 팀장 승인 화면 확인용. 정원(5) 중 3명이 차 있어 2건 모두 승인 가능한 상태다.
    await step('더미팀 가입 신청 2건 (PENDING)', async () => {
      const [[membership]] = await pool.query(
        'SELECT team_id FROM TeamMembers WHERE user_id = ? LIMIT 1',
        [leader]
      );
      if (!membership) throw new Error('팀이 없습니다 — seed-demo의 팀 생성이 건너뛰어졌습니다.');
      const applicants = [
        [solo1, 'ANALYST'],
        [solo2, 'TRADER'],
      ];
      for (const [userId, position] of applicants) {
        await findOrInsert(
          "SELECT id FROM TeamJoinRequests WHERE team_id = ? AND user_id = ? AND status = 'PENDING'",
          [membership.team_id, userId],
          'INSERT INTO TeamJoinRequests (team_id, user_id, position) VALUES (?, ?, ?)',
          [membership.team_id, userId, position]
        );
      }
      return `team_id=${membership.team_id}, ANALYST·TRADER 각 1건`;
    });

    await step('퀴즈 응시 이력 2건 (member1)', async () => {
      const [topics] = await pool.query('SELECT id FROM Topics ORDER BY sort_order, id LIMIT 2');
      if (!topics.length) {
        throw new Error('Topics가 없습니다 — "npm run seed:learning"을 먼저 실행하세요.');
      }
      const scores = [
        { correct: 4, total: 5 },
        { correct: 3, total: 5 },
      ];
      for (const [i, topic] of topics.entries()) {
        const plan = scores[i] || scores[0];
        await findOrInsert(
          "SELECT id FROM QuizAttempts WHERE user_id = ? AND topic_id = ? AND status = 'COMPLETED'",
          [member1, topic.id],
          `INSERT INTO QuizAttempts
             (user_id, topic_id, status, correct_count, total_quiz_count, score, completed_at)
           VALUES (?, ?, 'COMPLETED', ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
          [
            member1,
            topic.id,
            plan.correct,
            plan.total,
            Math.round((plan.correct / plan.total) * 100),
            i + 1,
          ]
        );
      }
      return `${topics.length}개 주제, 점수 ${scores.map((s) => Math.round((s.correct / s.total) * 100)).join('·')}`;
    });

    await step('종목 알림 2건 (leader)', async () => {
      if (!hasStocks) {
        throw new Error('AAPL/NVDA가 없습니다 — "npm run seed:stocks"를 먼저 실행하세요.');
      }
      const alerts = [
        ['AAPL', 'TARGET_PRICE', 250],
        ['NVDA', 'STOP_LOSS', 150],
      ];
      for (const [stockCode, type, threshold] of alerts) {
        await pool.query(
          `INSERT INTO StockAlerts (user_id, stock_code, type, threshold) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE threshold = VALUES(threshold), is_enabled = TRUE`,
          [leader, stockCode, type, threshold]
        );
      }
      return 'AAPL 목표가 250, NVDA 손절 150';
    });

    console.log('\n=== 신규 기능 QA 데이터 시딩 완료 ===');
    const [summary] = await pool.query(
      `SELECT '약관동의' AS 항목, COUNT(*) AS 건수 FROM UserAgreements
       UNION ALL SELECT '휴대폰번호', COUNT(*) FROM Users WHERE phone IS NOT NULL
       UNION ALL SELECT '알림설정', COUNT(*) FROM NotificationPrefs
       UNION ALL SELECT '게시글', COUNT(*) FROM CommunityPosts
       UNION ALL SELECT '댓글', COUNT(*) FROM CommunityComments
       UNION ALL SELECT '차단', COUNT(*) FROM CommunityBlocks
       UNION ALL SELECT '신고', COUNT(*) FROM CommunityReports
       UNION ALL SELECT '이용제한', COUNT(*) FROM UserRestrictions
       UNION ALL SELECT '이의신청', COUNT(*) FROM RestrictionAppeals
       UNION ALL SELECT '팀가입신청(대기)', COUNT(*) FROM TeamJoinRequests WHERE status = 'PENDING'
       UNION ALL SELECT '퀴즈이력', COUNT(*) FROM QuizAttempts
       UNION ALL SELECT '종목알림', COUNT(*) FROM StockAlerts`
    );
    console.table(summary);

    process.exitCode = 0;
  } catch (err) {
    console.error('신규 기능 QA 데이터 시딩 실패:', err.message);
    process.exitCode = 1;
  } finally {
    await closeSeedResources({ pool, redis });
  }
})();
