-- =============================================================================
-- 프로젝트 스키마 DDL (MySQL 8.0+ / mysql2 호환)
-- 문자셋: utf8mb4 (이모지/한글 안전)
-- 엔진: InnoDB (FK, 트랜잭션 지원)
--
-- 변경 이력:
-- 2026-04-30: 초기 스키마 + 대댓글(parent_id), 스크랩(PostBookmarks), 알림 COMMENT_REPLY 추가
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================================
-- 1. 기초 정보 (학교/유저/인증)
-- =============================================================================

-- 1-1. schools
CREATE TABLE IF NOT EXISTS schools (
  id            INT          NOT NULL AUTO_INCREMENT,
  school_name   VARCHAR(100) NOT NULL,
  region        VARCHAR(50)  NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_school_name (school_name),
  INDEX idx_region (region)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1-2. Users
CREATE TABLE IF NOT EXISTS Users (
  id                  INT          NOT NULL AUTO_INCREMENT,
  email               VARCHAR(255) NOT NULL,
  password            VARCHAR(255) NULL,                                  -- 소셜 로그인 시 NULL
  nickname            VARCHAR(50)  NOT NULL,
  role                ENUM('USER','ADMIN') NOT NULL DEFAULT 'USER',
  position            ENUM('TRADER','ANALYST','NONE') NOT NULL DEFAULT 'NONE',
  provider            VARCHAR(20)  NOT NULL DEFAULT 'local',              -- local, kakao, naver, google
  sns_id              VARCHAR(255) NULL,
  school_id           INT          NULL,
  region              VARCHAR(255) NULL,
  school_is_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  INDEX idx_users_school_id (school_id),
  INDEX idx_users_provider_sns (provider, sns_id),
  CONSTRAINT fk_users_school
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1-4. RefreshTokens
CREATE TABLE IF NOT EXISTS RefreshTokens (
  id          INT          NOT NULL AUTO_INCREMENT,
  user_id     INT          NOT NULL,
  token_hash  VARCHAR(255) NOT NULL,
  ip_address  VARCHAR(45)  NULL,
  user_agent  VARCHAR(255) NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  TIMESTAMP    NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_refresh_user_id (user_id),
  INDEX idx_refresh_token_hash (token_hash),
  CONSTRAINT fk_refresh_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1-5. school_VerificationLogs
CREATE TABLE IF NOT EXISTS school_VerificationLogs (
  id             INT          NOT NULL AUTO_INCREMENT,
  user_id        INT          NOT NULL,
  admin_id       INT          NULL,
  status         ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  reject_reason  TEXT         NULL,
  file_path      VARCHAR(255) NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at   TIMESTAMP    NULL,
  PRIMARY KEY (id),
  INDEX idx_school_verif_user (user_id),
  INDEX idx_school_verif_status (status),
  CONSTRAINT fk_school_verif_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_school_verif_admin
    FOREIGN KEY (admin_id) REFERENCES Users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 2. 활동 및 퀴즈 (출석/포인트/학습)
-- =============================================================================

-- 2-1. Attendances
CREATE TABLE IF NOT EXISTS Attendances (
  id                   INT       NOT NULL AUTO_INCREMENT,
  user_id              INT       NOT NULL,
  attendance_date      DATE      NOT NULL,
  consecutive_days     INT       NOT NULL DEFAULT 0,
  total_learning_days  INT       NOT NULL DEFAULT 0,
  last_active_date     DATE      NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attend_user_date (user_id, attendance_date),
  CONSTRAINT fk_attend_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2-2. Topics
CREATE TABLE IF NOT EXISTS Topics (
  id          INT          NOT NULL AUTO_INCREMENT,
  title       VARCHAR(100) NOT NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_topics_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2-3. ShortForms
CREATE TABLE IF NOT EXISTS ShortForms (
  id           INT          NOT NULL AUTO_INCREMENT,
  topic_id     INT          NOT NULL,
  title        VARCHAR(100) NOT NULL,
  description  VARCHAR(500) NULL,
  video_url    VARCHAR(255) NOT NULL,
  sort_order   INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_shortform_topic_sort (topic_id, sort_order),
  CONSTRAINT fk_shortform_topic
    FOREIGN KEY (topic_id) REFERENCES Topics(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2-4. Quizzes
CREATE TABLE IF NOT EXISTS Quizzes (
  id             INT          NOT NULL AUTO_INCREMENT,
  topic_id       INT          NOT NULL,
  type           ENUM('CHOICE','OX','MATCH','SHORT') NOT NULL,
  difficulty     ENUM('BEGINNER','INTERMEDIATE','ADVANCED') NOT NULL,
  question_data  JSON         NOT NULL,
  answer_data    JSON         NOT NULL,
  sort_order     INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_quiz_topic_sort (topic_id, sort_order),
  CONSTRAINT fk_quiz_topic
    FOREIGN KEY (topic_id) REFERENCES Topics(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2-5. UserShortformLog
CREATE TABLE IF NOT EXISTS UserShortformLog (
  id            INT       NOT NULL AUTO_INCREMENT,
  user_id       INT       NOT NULL,
  shortform_id  INT       NOT NULL,
  is_completed  BOOLEAN   NOT NULL DEFAULT FALSE,
  is_liked      BOOLEAN   NOT NULL DEFAULT FALSE,
  is_saved      BOOLEAN   NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usf_user_shortform (user_id, shortform_id),
  INDEX idx_usf_shortform (shortform_id),
  CONSTRAINT fk_usf_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_usf_shortform
    FOREIGN KEY (shortform_id) REFERENCES ShortForms(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2-6. UserQuizLog
CREATE TABLE IF NOT EXISTS UserQuizLog (
  id          INT       NOT NULL AUTO_INCREMENT,
  user_id     INT       NOT NULL,
  quiz_id     INT       NOT NULL,
  is_correct  BOOLEAN   NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_uql_user_quiz (user_id, quiz_id),
  INDEX idx_uql_quiz (quiz_id),
  CONSTRAINT fk_uql_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_uql_quiz
    FOREIGN KEY (quiz_id) REFERENCES Quizzes(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2-7. UserProgress
CREATE TABLE IF NOT EXISTS UserProgress (
  user_id            INT       NOT NULL,
  topic_id           INT       NOT NULL,
  is_shortform_done  BOOLEAN   NOT NULL DEFAULT FALSE,
  is_quiz_done       BOOLEAN   NOT NULL DEFAULT FALSE,
  correct_count      INT       NOT NULL DEFAULT 0,
  total_quiz_count   INT       NOT NULL DEFAULT 0,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, topic_id),
  INDEX idx_progress_topic (topic_id),
  CONSTRAINT fk_progress_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_progress_topic
    FOREIGN KEY (topic_id) REFERENCES Topics(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2-8. UserPoints
CREATE TABLE IF NOT EXISTS UserPoints (
  user_id         INT       NOT NULL,
  current_points  INT       NOT NULL DEFAULT 0,
  total_earned    INT       NOT NULL DEFAULT 0,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_points_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2-9. PointLogs
CREATE TABLE IF NOT EXISTS PointLogs (
  id             INT       NOT NULL AUTO_INCREMENT,
  user_id        INT       NOT NULL,
  change_amount  INT       NOT NULL,
  balance_after  INT       NOT NULL,
  reason         ENUM('QUIZ_REWARD','ATTENDANCE','ADMIN_ADJUST') NOT NULL DEFAULT 'QUIZ_REWARD',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_pointlogs_user_created (user_id, created_at),
  CONSTRAINT fk_pointlogs_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 3. 팀 및 포트폴리오
-- =============================================================================

-- 3-1. Teams
CREATE TABLE IF NOT EXISTS Teams (
  id                   INT         NOT NULL AUTO_INCREMENT,
  school_id            INT         NOT NULL,
  name                 VARCHAR(50) NOT NULL,
  max_member_count     INT         NOT NULL DEFAULT 4,
  current_member_count INT         NOT NULL DEFAULT 1,
  created_at           TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_teams_school_name (school_id, name),
  CONSTRAINT fk_teams_school
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3-2. TeamMembers
CREATE TABLE IF NOT EXISTS TeamMembers (
  id         INT       NOT NULL AUTO_INCREMENT,
  team_id    INT       NOT NULL,
  user_id    INT       NOT NULL,
  role       ENUM('LEADER','MEMBER') NOT NULL DEFAULT 'MEMBER',
  joined_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_teammembers_user (user_id),
  INDEX idx_teammembers_team (team_id),
  CONSTRAINT fk_tm_team
    FOREIGN KEY (team_id) REFERENCES Teams(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tm_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3-3. Portfolios
CREATE TABLE IF NOT EXISTS Portfolios (
  id              INT          NOT NULL AUTO_INCREMENT,
  team_id         INT          NOT NULL,
  proposed_by     INT          NOT NULL,
  title           VARCHAR(100) NOT NULL,
  approval_count  INT          NOT NULL DEFAULT 0,
  rejection_count INT          NOT NULL DEFAULT 0,
  status          ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_portfolio_team_status (team_id, status),
  INDEX idx_portfolio_proposer (proposed_by),
  CONSTRAINT fk_portfolio_team
    FOREIGN KEY (team_id) REFERENCES Teams(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_portfolio_proposer
    FOREIGN KEY (proposed_by) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3-4. TeamActivePortfolios
CREATE TABLE IF NOT EXISTS TeamActivePortfolios (
  team_id                   INT            NOT NULL,
  portfolio_id              INT            NOT NULL,
  weekly_update_count       INT            NOT NULL DEFAULT 0,
  max_update_count          INT            NOT NULL DEFAULT 3,
  weekly_total_trade_amount DECIMAL(18,2)  NOT NULL DEFAULT 0,
  weekly_turnover_rate      DECIMAL(8,4)   NOT NULL DEFAULT 0,
  activated_at              TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id),
  INDEX idx_tap_portfolio (portfolio_id),
  CONSTRAINT fk_tap_team
    FOREIGN KEY (team_id) REFERENCES Teams(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tap_portfolio
    FOREIGN KEY (portfolio_id) REFERENCES Portfolios(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3-5. PortfolioAllocations
CREATE TABLE IF NOT EXISTS PortfolioAllocations (
  id                INT           NOT NULL AUTO_INCREMENT,
  portfolio_id      INT           NOT NULL,
  stock_code        VARCHAR(20)   NOT NULL,
  target_percentage DECIMAL(5,2)  NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_pa_portfolio (portfolio_id),
  INDEX idx_pa_stock (stock_code),
  CONSTRAINT fk_pa_portfolio
    FOREIGN KEY (portfolio_id) REFERENCES Portfolios(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3-6. PortfolioVotes
CREATE TABLE IF NOT EXISTS PortfolioVotes (
  id            INT       NOT NULL AUTO_INCREMENT,
  portfolio_id  INT       NOT NULL,
  voter_id      INT       NOT NULL,
  is_approved   BOOLEAN   NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pv_portfolio_voter (portfolio_id, voter_id),
  INDEX idx_pv_voter (voter_id),
  CONSTRAINT fk_pv_portfolio
    FOREIGN KEY (portfolio_id) REFERENCES Portfolios(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pv_voter
    FOREIGN KEY (voter_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 4. 가상 계좌 및 트레이딩
-- =============================================================================

-- 4-0. Stocks
CREATE TABLE IF NOT EXISTS Stocks (
  stock_code  VARCHAR(20)  NOT NULL,
  name        VARCHAR(100) NOT NULL,
  market      ENUM('KOSPI','KOSDAQ') NOT NULL,
  status      ENUM('ACTIVE','SUSPENDED','DELISTED') NOT NULL DEFAULT 'ACTIVE',
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (stock_code),
  INDEX idx_stocks_name (name),
  INDEX idx_stocks_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5-1. Seasons (VirtualAccounts가 참조하므로 먼저 생성)
CREATE TABLE IF NOT EXISTS Seasons (
  id          INT          NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100) NOT NULL,
  start_date  DATE         NOT NULL,
  end_date    DATE         NOT NULL,
  total_days  INT          NOT NULL,
  status      ENUM('UPCOMING','ACTIVE','COMPLETED') NOT NULL DEFAULT 'UPCOMING',
  PRIMARY KEY (id),
  INDEX idx_seasons_status (status),
  INDEX idx_seasons_dates (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4-1. VirtualAccounts
CREATE TABLE IF NOT EXISTS VirtualAccounts (
  id                  INT            NOT NULL AUTO_INCREMENT,
  account_type        ENUM('INDIVIDUAL','TEAM') NOT NULL,
  school_group        ENUM('HIGH_SCHOOL','UNIVERSITY') NOT NULL,
  user_id             INT            NULL,
  team_id             INT            NULL,
  season_id           INT            NOT NULL,
  initial_cash        DECIMAL(15,2)  NOT NULL,
  cash_balance        DECIMAL(15,2)  NOT NULL,
  total_equity        DECIMAL(15,2)  NOT NULL,
  current_return_rate DECIMAL(8,4)   NOT NULL DEFAULT 0.0000,
  active_days         INT            NOT NULL DEFAULT 0,
  created_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_va_team_season (team_id, season_id),
  UNIQUE KEY uq_va_user_season (user_id, season_id),
  INDEX idx_va_season_type (season_id, account_type),
  CONSTRAINT fk_va_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_va_team
    FOREIGN KEY (team_id) REFERENCES Teams(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_va_season
    FOREIGN KEY (season_id) REFERENCES Seasons(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4-2. AccountAssetHistories
CREATE TABLE IF NOT EXISTS AccountAssetHistories (
  id           INT            NOT NULL AUTO_INCREMENT,
  account_id   INT            NOT NULL,
  recorded_at  DATE           NOT NULL,
  total_equity DECIMAL(15,2)  NOT NULL,
  return_rate  DECIMAL(8,4)   NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_aah_account_date (account_id, recorded_at),
  CONSTRAINT fk_aah_account
    FOREIGN KEY (account_id) REFERENCES VirtualAccounts(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4-3. AccountHoldings
CREATE TABLE IF NOT EXISTS AccountHoldings (
  id                INT            NOT NULL AUTO_INCREMENT,
  account_id        INT            NOT NULL,
  stock_code        VARCHAR(20)    NOT NULL,
  quantity          DECIMAL(15,4)  NOT NULL DEFAULT 0,
  average_buy_price DECIMAL(15,2)  NOT NULL,
  updated_at        TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ah_account_stock (account_id, stock_code),
  CONSTRAINT fk_ah_account
    FOREIGN KEY (account_id) REFERENCES VirtualAccounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ah_stock
    FOREIGN KEY (stock_code) REFERENCES Stocks(stock_code) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4-4. Orders
CREATE TABLE IF NOT EXISTS Orders (
  id                 INT            NOT NULL AUTO_INCREMENT,
  account_id         INT            NOT NULL,
  trader_id          INT            NOT NULL,
  stock_code         VARCHAR(20)    NOT NULL,
  order_type         ENUM('BUY','SELL') NOT NULL,
  price_type         ENUM('MARKET','LIMIT') NOT NULL,
  order_price        DECIMAL(15,2)  NULL,
  order_quantity     DECIMAL(15,4)  NOT NULL,
  executed_price     DECIMAL(15,2)  NULL,
  executed_quantity  DECIMAL(15,4)  NOT NULL DEFAULT 0,
  status             ENUM('PENDING','COMPLETED','CANCELED','FAILED') NOT NULL DEFAULT 'PENDING',
  created_at         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at       TIMESTAMP      NULL,
  PRIMARY KEY (id),
  INDEX idx_orders_account_status (account_id, status),
  INDEX idx_orders_trader (trader_id),
  INDEX idx_orders_stock (stock_code),
  CONSTRAINT fk_orders_account
    FOREIGN KEY (account_id) REFERENCES VirtualAccounts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_orders_trader
    FOREIGN KEY (trader_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_orders_stock
    FOREIGN KEY (stock_code) REFERENCES Stocks(stock_code) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4-5. OrderExecutionLogs
CREATE TABLE IF NOT EXISTS OrderExecutionLogs (
  id                INT            NOT NULL AUTO_INCREMENT,
  order_id          INT            NOT NULL,
  executed_price    DECIMAL(15,2)  NOT NULL,
  executed_quantity DECIMAL(15,4)  NOT NULL,
  trading_fee       DECIMAL(15,2)  NOT NULL DEFAULT 0,
  execution_amount  DECIMAL(15,2)  NULL,
  executed_at       TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_oel_order (order_id),
  CONSTRAINT fk_oel_order
    FOREIGN KEY (order_id) REFERENCES Orders(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4-6. Watchlist
CREATE TABLE IF NOT EXISTS Watchlist (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  user_id     INT          NOT NULL,
  stock_code  VARCHAR(20)  NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_watchlist_user_stock (user_id, stock_code),
  INDEX idx_watchlist_user (user_id),
  CONSTRAINT fk_watchlist_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_watchlist_stock
    FOREIGN KEY (stock_code) REFERENCES Stocks(stock_code) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 5. 랭킹
-- =============================================================================

-- 5-2. DailyRankings
CREATE TABLE IF NOT EXISTS DailyRankings (
  id                  INT            NOT NULL AUTO_INCREMENT,
  season_id           INT            NOT NULL,
  target_type         ENUM('USER','TEAM','SCHOOL') NOT NULL,
  target_id           INT            NOT NULL,
  rank_date           DATE           NOT NULL,
  rank_position       INT            NOT NULL,
  return_rate         DECIMAL(8,4)   NOT NULL,
  final_score         DECIMAL(10,4)  NOT NULL,
  participation_rate  DECIMAL(5,2)   NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dr_target_date (target_type, target_id, rank_date, season_id),
  INDEX idx_dr_season_date_type (season_id, rank_date, target_type),
  INDEX idx_dr_rank (rank_date, target_type, rank_position),
  CONSTRAINT fk_dr_season
    FOREIGN KEY (season_id) REFERENCES Seasons(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 6. 커뮤니티 및 소셜
-- =============================================================================

-- 6-1. CommunityPosts
CREATE TABLE IF NOT EXISTS CommunityPosts (
  id             INT          NOT NULL AUTO_INCREMENT,
  user_id        INT          NOT NULL,
  post_type      ENUM('STOCK_DISCUSSION','GENERAL') NOT NULL,
  stock_code     VARCHAR(20)  NULL,
  opinion        ENUM('BUY','NEUTRAL','SELL') NULL,
  title          VARCHAR(255) NOT NULL,
  content        TEXT         NOT NULL,
  view_count     INT          NOT NULL DEFAULT 0,
  like_count     INT          NOT NULL DEFAULT 0,
  comment_count  INT          NOT NULL DEFAULT 0,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at     TIMESTAMP    NULL,
  PRIMARY KEY (id),
  INDEX idx_cp_user_id (user_id),
  INDEX idx_cp_stock_code (stock_code),
  INDEX idx_cp_type_created (post_type, created_at),
  INDEX idx_cp_deleted_created (deleted_at, created_at),
  CONSTRAINT fk_cp_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cp_stock
    FOREIGN KEY (stock_code) REFERENCES Stocks(stock_code) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6-2. CommunityComments (대댓글: parent_id, 1depth만 허용 — 앱 레벨에서 제한)
CREATE TABLE IF NOT EXISTS CommunityComments (
  id          INT       NOT NULL AUTO_INCREMENT,
  post_id     INT       NOT NULL,
  user_id     INT       NOT NULL,
  parent_id   INT       NULL,                                             -- NULL=댓글, NOT NULL=대댓글
  content     TEXT      NOT NULL,
  like_count  INT       NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP NULL,
  PRIMARY KEY (id),
  INDEX idx_cc_post (post_id, deleted_at),
  INDEX idx_cc_user (user_id),
  INDEX idx_cc_parent (parent_id),
  CONSTRAINT fk_cc_post
    FOREIGN KEY (post_id) REFERENCES CommunityPosts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cc_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cc_parent
    FOREIGN KEY (parent_id) REFERENCES CommunityComments(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6-3. PostLikes
CREATE TABLE IF NOT EXISTS PostLikes (
  id          INT       NOT NULL AUTO_INCREMENT,
  post_id     INT       NOT NULL,
  user_id     INT       NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pl_post_user (post_id, user_id),
  INDEX idx_pl_user (user_id),
  CONSTRAINT fk_pl_post
    FOREIGN KEY (post_id) REFERENCES CommunityPosts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pl_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6-4. CommentLikes
CREATE TABLE IF NOT EXISTS CommentLikes (
  id          INT       NOT NULL AUTO_INCREMENT,
  comment_id  INT       NOT NULL,
  user_id     INT       NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cl_comment_user (comment_id, user_id),
  INDEX idx_cl_user (user_id),
  CONSTRAINT fk_cl_comment
    FOREIGN KEY (comment_id) REFERENCES CommunityComments(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cl_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6-5. Follows
CREATE TABLE IF NOT EXISTS Follows (
  id           INT       NOT NULL AUTO_INCREMENT,
  follower_id  INT       NOT NULL,
  followee_id  INT       NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_follows_pair (follower_id, followee_id),
  INDEX idx_follows_followee (followee_id),
  CONSTRAINT fk_follows_follower
    FOREIGN KEY (follower_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_follows_followee
    FOREIGN KEY (followee_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6-6. Notifications (COMMENT_REPLY 추가)
CREATE TABLE IF NOT EXISTS Notifications (
  id            INT          NOT NULL AUTO_INCREMENT,
  user_id       INT          NOT NULL,
  sender_id     INT          NOT NULL,
  type          ENUM('FOLLOWEE_POST','POST_LIKE','POST_COMMENT','COMMENT_REPLY','VOTE_START','PORTFOLIO_CHANGED') NOT NULL,
  reference_id  INT          NULL,
  content       VARCHAR(255) NULL,
  is_read       BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_notif_user_read_created (user_id, is_read, created_at),
  INDEX idx_notif_sender (sender_id),
  CONSTRAINT fk_notif_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notif_sender
    FOREIGN KEY (sender_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6-7. PostStockTags
CREATE TABLE IF NOT EXISTS PostStockTags (
  id          INT          NOT NULL AUTO_INCREMENT,
  post_id     INT          NOT NULL,
  stock_code  VARCHAR(20)  NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pst_post_stock (post_id, stock_code),
  INDEX idx_pst_stock (stock_code),
  CONSTRAINT fk_pst_post
    FOREIGN KEY (post_id) REFERENCES CommunityPosts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pst_stock
    FOREIGN KEY (stock_code) REFERENCES Stocks(stock_code) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6-8. PostViews
CREATE TABLE IF NOT EXISTS PostViews (
  id          INT       NOT NULL AUTO_INCREMENT,
  post_id     INT       NOT NULL,
  user_id     INT       NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pv_post_user (post_id, user_id),
  INDEX idx_pv_user (user_id),
  CONSTRAINT fk_pv_post
    FOREIGN KEY (post_id) REFERENCES CommunityPosts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pv_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6-9. PostBookmarks (스크랩)
CREATE TABLE IF NOT EXISTS PostBookmarks (
  id          INT       NOT NULL AUTO_INCREMENT,
  post_id     INT       NOT NULL,
  user_id     INT       NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pb_post_user (post_id, user_id),
  INDEX idx_pb_user (user_id),
  CONSTRAINT fk_pb_post
    FOREIGN KEY (post_id) REFERENCES CommunityPosts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pb_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 후처리: 순환/순서 의존 FK
-- =============================================================================

ALTER TABLE PortfolioAllocations
  ADD CONSTRAINT fk_pa_stock
  FOREIGN KEY (stock_code) REFERENCES Stocks(stock_code) ON UPDATE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
