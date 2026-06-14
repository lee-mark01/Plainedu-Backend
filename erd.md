### sql선언문(초안)

```sql
-- =============================================================================
-- 프로젝트 스키마 DDL (MySQL 8.0+ / mysql2 호환)
-- 문자셋: utf8mb4 (이모지/한글 안전)
-- 엔진: InnoDB (FK, 트랜잭션 지원)
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
  id                   INT          NOT NULL AUTO_INCREMENT,
  user_id              INT          NOT NULL,
  token_hash           VARCHAR(255) NOT NULL,
  family_id            CHAR(36)     NOT NULL,               -- UUID, 세션 계보 (Reuse Detection)
  used                 TINYINT(1)   NOT NULL DEFAULT 0,     -- 소비 여부: 1이면 탈취 의심
  ip_address           VARCHAR(45)  NULL,
  user_agent           VARCHAR(255) NULL,
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at           TIMESTAMP    NOT NULL,               -- 슬라이딩 만료 (갱신 시 7일 연장)
  absolute_expires_at  TIMESTAMP    NOT NULL,               -- 절대 만료 (최초 발급 시 90일 고정)
  PRIMARY KEY (id),
  INDEX idx_refresh_user_id (user_id),
  INDEX idx_refresh_token_hash (token_hash),
  INDEX idx_refresh_family_id (family_id),
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
-- difficulty 한글 -> 영어로 변경 권장
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

-- 2-5. UserShortformLog (오타 수정: Shotform -> Shortform)
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
  UNIQUE KEY uq_teammembers_user (user_id),     -- 1인 1팀
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
  -- stock_code FK는 Stocks 생성 후 ALTER로 추가 (선언 순서)
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
-- CHECK: 개인계좌면 user_id 필수+team_id NULL, 팀계좌면 그 반대
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
  UNIQUE KEY uq_va_team_season (team_id, season_id),       -- 팀당 시즌 1계좌
  UNIQUE KEY uq_va_user_season (user_id, season_id),       -- 개인당 시즌 1계좌
  INDEX idx_va_season_type (season_id, account_type),
  CONSTRAINT fk_va_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_va_team
    FOREIGN KEY (team_id) REFERENCES Teams(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_va_season
    FOREIGN KEY (season_id) REFERENCES Seasons(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  -- MySQL 8.0.16+ CHECK 제약 enforced
  CONSTRAINT chk_va_owner CHECK (
    (account_type = 'INDIVIDUAL' AND user_id IS NOT NULL AND team_id IS NULL)
    OR
    (account_type = 'TEAM' AND team_id IS NOT NULL AND user_id IS NULL)
  )
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
    FOREIGN KEY (stock_code) REFERENCES Stocks(stock_code) ON UPDATE CASCADE,
  -- 종목토론은 stock_code & opinion 필수, 일반은 둘 다 NULL
  CONSTRAINT chk_cp_type_fields CHECK (
    (post_type = 'STOCK_DISCUSSION' AND stock_code IS NOT NULL AND opinion IS NOT NULL)
    OR
    (post_type = 'GENERAL' AND stock_code IS NULL AND opinion IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6-2. CommunityComments
CREATE TABLE IF NOT EXISTS CommunityComments (
  id          INT       NOT NULL AUTO_INCREMENT,
  post_id     INT       NOT NULL,
  user_id     INT       NOT NULL,
  content     TEXT      NOT NULL,
  like_count  INT       NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP NULL,
  PRIMARY KEY (id),
  INDEX idx_cc_post (post_id, deleted_at),
  INDEX idx_cc_user (user_id),
  CONSTRAINT fk_cc_post
    FOREIGN KEY (post_id) REFERENCES CommunityPosts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cc_user
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
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
    FOREIGN KEY (followee_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_follows_self CHECK (follower_id <> followee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6-6. Notifications
CREATE TABLE IF NOT EXISTS Notifications (
  id            INT          NOT NULL AUTO_INCREMENT,
  user_id       INT          NOT NULL,
  sender_id     INT          NOT NULL,
  type          ENUM('FOLLOWEE_POST','POST_LIKE','POST_COMMENT','VOTE_START','PORTFOLIO_CHANGED') NOT NULL,
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

-- =============================================================================
-- 후처리: 순환/순서 의존 FK
-- =============================================================================

-- PortfolioAllocations.stock_code -> Stocks
ALTER TABLE PortfolioAllocations
  ADD CONSTRAINT fk_pa_stock
  FOREIGN KEY (stock_code) REFERENCES Stocks(stock_code) ON UPDATE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
```

---

# db 스키마

## 1. 기초 정보 (학교/유저/인증)

### **1-1. schools (학교 마스터 데이터)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 학교 고유 ID | INT | PK | Auto Increment |
| school_name | 학교명 | VARCHAR(100) | - | Not Null / 인덱스(idx_school_name) |
| region | 시/도 (예: 서울, 경기) | VARCHAR(50) | - | 인덱스(idx_region) |
| created_at | 데이터 생성 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |

### **1-2. Users (사용자)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 사용자 고유 ID | INT | PK | Auto Increment |
| email | 로그인용 이메일 | VARCHAR(255) | - | Unique / Not Null |
| password | 비밀번호 | VARCHAR(255) | - | 소셜 로그인은 NULL 처리 |
| nickname | 앱 내 표시 닉네임 | VARCHAR(50) | - | Not Null |
| role | 사용자 권한 | ENUM | - | Users_role_enum / (USER, ADMIN) / Not Null / 기본값 USER |
| position | 앱 내 직책 (변경 가능) | ENUM | - | user_position_enum / (TRADER, ANALYST, NONE) / 기본값 NONE |
| created_at | 계정 생성 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |
| provider | 로그인 제공자 | VARCHAR(20) | - | 기본값 local (local, kakao, naver, google) |
| sns_id | 소셜 연동 고유 ID | VARCHAR(255) | - |  |
| school_id | 소속 학교 _id  | INT | FK | schools(id) 참조  |
| region | 소속 학교 지역 | VARCHAR(255) | - |  |
| school_is_verified | 학교 인증 여부 | BOOLEAN | - | 기본값 FALSE |
|  |  |  |  |  |

### **1-4. RefreshTokens (보안/토큰)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 토큰 고유 ID | INT | PK | Auto Increment |
| user_id | 토큰 소유자 | INT | FK | Users(id) 참조 / Not Null / CASCADE 삭제 |
| token_hash | Refresh Token 해시값 | VARCHAR(255) | - | Not Null / SHA-256 해시 저장 / 인덱스(idx_refresh_token_hash) |
| family_id | 세션 계보 ID | CHAR(36) | - | Not Null / UUID / 로그인 1회 = family 1개 / 인덱스(idx_refresh_family_id) |
| used | 소비 여부 | TINYINT(1) | - | 기본값 0 / 1이면 이미 사용된 토큰 = 재사용 시 탈취 의심 |
| ip_address | 접속 기기 IP 주소 | VARCHAR(45) | - | IPv6 대응 / 감사 로그용 |
| user_agent | 브라우저/기기 정보 | VARCHAR(255) | - | 감사 로그용 |
| created_at | 토큰 발급 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |
| expires_at | 슬라이딩 만료 일시 | TIMESTAMP | - | Not Null / 갱신 시마다 7일 연장 / 7일 미사용 시 만료 |
| absolute_expires_at | 절대 만료 일시 | TIMESTAMP | - | Not Null / 최초 발급 시 90일 고정 / 아무리 갱신해도 이 날짜 이후 재로그인 필요 |

**토큰 보안 전략:**
- **Rotation** — `/refresh` 호출 시 기존 토큰 `used=1` 처리 후 신규 토큰 발급
- **Reuse Detection** — `used=1` 토큰 재사용 감지 시 `family_id` 기준 세션 계보 전체 삭제 (탈취 대응)
- **배치 정리** — 매일 새벽 3시 `absolute_expires_at < NOW()` 인 행 삭제 (`used=1`이어도 절대 만료 전까지 보존)

### **1-5. school_VerificationLogs (학교 인증 로그)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 로그 고유 ID | INT | PK | Auto Increment |
| user_id | 요청 유저 | INT | FK | Users(id) 참조 / Not Null / CASCADE 삭제 |
| admin_id | 승인 처리한 관리자 ID | INT | - |  |
| status | 처리 상태 | ENUM | - | school_VerificationLogs_status_enum / (PENDING, APPROVED, REJECTED) / 기본값 PENDING |
| reject_reason | 인증 거절 사유 | TEXT | - |  |
| file_path | 증빙 서류 파일 경로 | VARCHAR(255) | - | S3 경로 등 |
| created_at | 요청 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |
| processed_at | 처리 완료 시점 | TIMESTAMP | - |  |

---

## 2. 활동 및 퀴즈 (출석/포인트/학습)

### **2-1. Attendances (출석 기록)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 출석 고유 ID | INT | PK | Auto Increment |
| user_id | 출석 유저 | INT | FK | Users(id) 참조 / Not Null / CASCADE 삭제 |
| attendance_date | 출석 인정 날짜 | DATE | - | Not Null / (user_id, attendance_date) 복합 Unique 인덱스 |
| created_at | 버튼 누른 시간 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |
| consecutive_days | 연속 출석일 | int |  | 기본값 0 |
| total_learning_days | 누적 총 학습일 | int |  |  |
| last_active_date | 마지막 활동 일자 | DATE |  |  |

### **2-2. Topics (학습 주제 - 최상위)**

| **변수명** | **설명** | **타입** | **제약 조건** |
| --- | --- | --- | --- |
| id | 주제 고유 ID | INT (PK) | Auto Increment |
| title | 주제 제목 | VARCHAR(100) | Not Null (예: 주식 기본 개념) |
| sort_order | 주제 노출 순서 | INT | 기본값 0 |

### **2-3. ShortForms (주제별 숏폼 영상)**

한 주제 내에 여러 영상. sort_order에 따라 재생 순서가 결정

| **변수명** | **설명** | **타입** | **제약 조건** |
| --- | --- | --- | --- |
| id | 영상 고유 ID | INT (PK) | Auto Increment |
| topic_id | 소속 주제 ID | INT (FK) | Topics(id) 참조 / CASCADE |
| title | 영상 제목 | VARCHAR(100) | Not Null |
| description | 영상 설명 | VARCHAR(500) |  |
| video_url | 영상 경로 | VARCHAR(255) | Not Null |
| sort_order | 주제 내 순서 | INT | 예: 1, 2, 3... |

### **2-4. Quizzes (주제별 퀴즈 문항)**

한 주제 내 여러 퀴즈.

| **변수명** | **설명** | **타입** | **제약 조건** |
| --- | --- | --- | --- |
| id | 퀴즈 고유 ID | INT (PK) | Auto Increment |
| topic_id | 소속 주제 ID | INT (FK) | Topics(id) 참조 / CASCADE |
| type | 문제 유형 | ENUM | (CHOICE, OX, MATCH, SHORT) |
| difficulty | 난이도 | ENUM | (초급, 중급, 고급.→BEGINNER, INTERMEDIATE, ADVANCED) |
| question_data | 문제 내용 | JSON | Not Null (질문 텍스트, 객관식 보기, 매칭 단어, 힌트 등 **질문상황**) |
| answer_data | 정답 및 해설 | JSON | Not Null (정답, 해설 등 **응답 후 상황**) |
| sort_order | 주제 내 순서 | INT | 예: 1, 2, 3... |
- 퀴즈_ json 형식의 경우:
    
    <aside>
    📌
    
    퀴즈형식별로 응답 칼럼이 상이. type으로 프론트엔드에서 분기처리함 
    
    더미 데이터로 예시: (3지선다 문제)
    
    - **type**: `CHOICE`
    - **difficulty**: 중급
    - **question_data**: JSON
    
    ```
    {
      "text": "주당 1,000원 배당을 하는 회사의 주식을 20주 가지고 있다면, 받을 수 있는 배당금은 얼마일까요?",
      "options": ["10,000원", "20,000원", "2,000원"]
      "hint": "보유 주식 수에 1주당 배당금을 곱해보세요."
    }
    ```
    
    - **answer_data**:JSON
    
    ```
    {
      "correct_index": 1,
      "explanation": "1주당 1,000원 × 20주 = 20,000원이에요!",
    }
    ```
    
    </aside>
    

### **2-5. UserShortformLog (숏폼 시청 기록)**

| **변수명** | **설명** | **타입** | **제약 조건** |
| --- | --- | --- | --- |
| id | 고유 ID | INT (PK) | Auto Increment |
| user_id | 유저 ID | INT (FK) | Users(id) 참조 / CASCADE |
| shortform_id | 대상 숏폼 ID | INT (FK) | ShortForms(id) 참조 / CASCADE |
| is_completed | 시청 완료 여부 | BOOLEAN | 기본값 FALSE |
| is_liked | 좋아요 여부 | BOOLEAN | 기본값 FALSE |
| is_saved | 저장 여부 | BOOLEAN | 기본값 FALSE |
| created_at | 시청 시점 | TIMESTAMP | - |

(user_id, shortform_id) 복합 Unique

### **2-6. UserQuizLog (퀴즈 풀이 결과 기록)**

| **변수명** | **설명** | **타입** | **제약 조건** |
| --- | --- | --- | --- |
| id | 로그 고유 ID | INT (PK) | Auto Increment |
| user_id | 유저 ID | INT (FK) | Users(id) 참조 / CASCADE |
| quiz_id | 대상 퀴즈 ID | INT (FK) | Quizzes(id) 참조 / CASCADE |
| is_correct | 정답 여부 | BOOLEAN | Not Null |
| created_at | 풀이 시점 | TIMESTAMP | 기본값 CURRENT_TIMESTAMP |

// 유저의 오답도 저장할 필요가 있나...?

### 2-7 UserProgress (진행도 요약)

로그를 매번 집계하지 않도록 상태요약. 주제단위임

| **변수명** | **설명** | **타입** | **제약 조건** |
| --- | --- | --- | --- |
| user_id | 유저 ID | INT (PK, FK) | Users(id) 참조 |
| topic_id | 주제 ID | INT (PK, FK) | Topics(id) 참조 |
| is_shortform_done | 숏폼 시청 완료 여부 | BOOLEAN | 주제 내 모든 숏폼 시청 시 TRUE |
| is_quiz_done | 퀴즈 제출 완료 여부 | BOOLEAN | 주제 내 모든 퀴즈 완료 시 TRUE |
| correct_count | 퀴즈 맞춘 개수 | INT | 기본값 0 (퀴즈 풀 때마다 +1) |
| total_quiz_count | 주제 내 전체 퀴즈 수 | INT | 프론트 표기용 (예: "3문제 중 1문제 정답") |
| updated_at | 갱신 시점 | TIMESTAMP | - |

### **2-8. UserPoints (유저 포인트)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| user_id | 유저 ID | INT | PK, FK | Users(id) 참조 |
| current_points | 현재 보유 포인트 | INT | - | 기본값 0 |
| total_earned | 누적 획득 포인트 | INT | - | 기본값 0 |
| updated_at | 업데이트 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |

### **2-9 . PointLogs (포인트 변동 로그)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 로그 고유 ID | INT | PK | Auto Increment |
| user_id | 유저 ID | INT | FK | Users(id) 참조 / Not Null / CASCADE 삭제 |
| change_amount | 변동 금액  | INT |  | Not Null |
| balance_after | 변동 후 잔액  | INT | - | Not Null |
| reason | 변동 사유  | ENUM | - | point_change_reason_enum /
(QUIZ_REWARD,
ATTENDANCE,
ADMIN_ADJUST)/ NOT Null,
기본값 : QUIZ_REWARD |
| created_at | 제안 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |

---

## 3. 팀 및 포트폴리오 시스템

### **3-1. Teams (팀 정보)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 팀 고유 ID | INT | PK | Auto Increment |
| school_id | 소속 학교 ID | INT | FK | schools(id) 참조 / Not Null / CASCADE 삭제 |
| name | 팀 이름 | VARCHAR(50) | - | Not Null / (school_id, name) 복합 Unique 인덱스 (팀명 중복 방지) |
| max_member_count | 팀 최대 정원 | INT | - | 기본값 4 |
| current_member_count | 현재 팀원 수 | INT | - | 기본값 1 |
| created_at | 팀 생성 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |

### **3-2. TeamMembers (팀원 구성)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 팀원 고유 ID | INT | PK | Auto Increment |
| team_id | 소속 팀 ID | INT | FK | Teams(id) 참조 / Not Null / CASCADE 삭제 |
| user_id | 유저 ID | INT | FK | Users(id) 참조 / Not Null / Unique (1인 1팀) / CASCADE 삭제 |
| role | 팀 내 권한 역할 | ENUM | - | team_member_role_enum / (LEADER, MEMBER) / Not Null / 기본값 MEMBER |
| joined_at | 합류 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |

### **3-3. Portfolios (포트폴리오 제안 및 투표)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 제안 고유 ID | INT | PK | Auto Increment |
| team_id | 소속 팀 ID | INT | FK | Teams(id) 참조 / Not Null / CASCADE 삭제 |
| proposed_by | 제안한 애널리스트 | INT | FK | Users(id) 참조 / Not Null / CASCADE 삭제 |
| title | 포트폴리오 제목 | VARCHAR(100) | - | Not Null |
| approval_count | 현재 찬성 수 | INT | - | 기본값 0 / 실시간 집계 |
| rejection_count | 현재 반대 수 | INT | - | 기본값 0 / 실시간 집계 |
| status | 처리 상태 | ENUM | - | portfolio_status_enum / (PENDING, APPROVED, REJECTED) / 기본값 PENDING |
| created_at | 제안 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |

### **3-4. TeamActivePortfolios (팀 현재 활성 포트폴리오 정보)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| team_id | 대상 팀 ID | INT | PK, FK | Teams(id) 참조 / 팀당 1개 정보만 존재 (1:1) |
| portfolio_id | 활성 포트폴리오 | INT | FK | Portfolios(id) 참조 / Not Null |
| weekly_update_count | 주간 승인/교체 횟수 | INT | - | 기본값 0 |
| max_update_count | 최대 교체 허용 횟수 | INT | - | 기본값 3 |
| weekly_total_trade_amount | 주간 누적 거래액 | DECIMAL(18,2) | - | 기본값 0 |
| weekly_turnover_rate | 주간 회전율 | DECIMAL(8,4) | - | 기본값 0 |
| activated_at | 활성화 시점 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |

### **3-5. PortfolioAllocations (포트폴리오 내 종목 비중 할당)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 할당 고유 ID | INT | PK | Auto Increment |
| portfolio_id | 대상 포트폴리오 ID | INT | FK | Portfolios(id) 참조 / Not Null / CASCADE 삭제 |
| stock_code | 주식 종목 코드 | VARCHAR(20) | - | Not Null |
| target_percentage | 목표 비중 (%) | DECIMAL(5,2) | - | Not Null |

### **3-6. PortfolioVotes (포트폴리오 찬반 투표 기록)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 투표 고유 ID | INT | PK | Auto Increment |
| portfolio_id | 대상 포트폴리오 ID | INT | FK | Portfolios(id) 참조 / Not Null / CASCADE 삭제 |
| voter_id | 투표 유저 ID | INT | FK | Users(id) 참조 / Not Null / CASCADE 삭제 / (portfolio_id, voter_id) 복합 Unique 인덱스 |
| is_approved | 찬성 여부 | BOOLEAN | - | Not Null |
| created_at | 투표 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |

---

## 4. 가상 계좌 및 트레이딩 시스템

### 4-0. Stocks (종목) [추가]

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| stock_code | 종목코드 (=id,  = ticker) | VARCHAR(20) | PK | Not Null |
| name | 종목명 | VARCHAR(100) | - | Not Null |
| market | 상장 마켓 | ENUM | - | market_enum / (KOSPI / KOSDAQ) / Not Null |
| status | 거래 가능 상태 | ENUM | - | status_enum / (ACTIVE /
SUSPENDED(거래정지) /
DELISTED(상장폐지)) / default: 'ACTIVE’ |
| updated_at | 갱신 시간 | TIMESTAMP | - | default: CURRENT_TIMESTAMP |

### **4-1. VirtualAccounts (통합 가상 계좌)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 계좌 고유 ID | INT | PK | Auto Increment |
| account_type | 계좌 운영 유형 (여기서 분기)  | ENUM | - | account_type_enum / (INDIVIDUAL, TEAM) / Not Null |
| school_group | 속한 리그 기준 | ENUM | - | school_group_enum / (HIGH_SCHOOL, UNIVERSITY) / Not Null |
| user_id | 소유주 (개인일 경우) | INT | FK | Users(id) 참조 / CASCADE 삭제 / 팀 계좌인 경우 NULL |
| team_id | 소유주 (팀일 경우) | INT | FK | Teams(id) 참조 / CASCADE 삭제 / 개인 계좌인 경우 NULL / 팀당 1개 계좌(1:1 관계) |
| initial_cash | 초기 지급 자본금 | DECIMAL(15,2) | - | Not Null |
| cash_balance | 주문 가능 현금 잔고 | DECIMAL(15,2) | - | Not Null |
| total_equity | 총 자산 평가액 | DECIMAL(15,2) | - | Not Null |
| current_return_rate | 현재 총 수익률 | DECIMAL(8,4) | - | 기본값 0.0000 |
| created_at | 계좌 개설 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |
| updated_at | 마지막 변동 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |
| season_id | 시즌 id | INT | FK | Seasons 참조 |
| active_days | 활성일수 (참여율 계산용..) | INT |  | 기본값 0 |

### **4-2. AccountAssetHistories (자산 일일 스냅샷)**

(자산 추이) 

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 스냅샷 고유 ID | INT | PK | Auto Increment |
| account_id | 대상 계좌 ID | INT | FK | VirtualAccounts(id) 참조 / Not Null / CASCADE 삭제 |
| recorded_at | 기록 스냅샷 날짜 | DATE | - | Not Null / (account_id, recorded_at) 복합 Unique 인덱스 |
| total_equity | 마감 총 자산 | DECIMAL(15,2) | - | Not Null |
| return_rate | 마감 수익률 | DECIMAL(8,4) | - | Not Null |

### **4-3. AccountHoldings (계좌 보유 종목)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 보유 기록 고유 ID | INT | PK | Auto Increment |
| account_id | 대상 계좌 ID | INT | FK | VirtualAccounts(id) 참조 / Not Null / CASCADE 삭제 |
| stock_code | 주식 종목 코드 | VARCHAR(20) | FK | Not Null / (account_id, stock_code) 복합 Unique 인덱스 |
| quantity | 현재 보유 수량 | DECIMAL(15,4) | - | Not Null / 기본값 0 |
| average_buy_price | 매수 평단가 | DECIMAL(15,2) | - | Not Null |
| updated_at | 업데이트 시점 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |

### **4-4. Orders (매매 주문)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 주문 고유 ID | INT | PK | Auto Increment |
| account_id | 대상 계좌 ID | INT | FK | VirtualAccounts(id) 참조 / Not Null / CASCADE 삭제 |
| trader_id | 실행 유저 ID | INT | FK | Users(id) 참조 / Not Null / CASCADE 삭제 |
| stock_code | 주식 종목 코드 | VARCHAR(20) | FK | Not Null |
| order_type | 매수 / 매도 방향 | ENUM | - | order_type_enum / (BUY, SELL) / Not Null |
| price_type | 시장가 / 지정가 | ENUM | - | price_type_enum / (MARKET, LIMIT) / Not Null |
| order_price | 주문 단가 | DECIMAL(15,2) | - |  |
| order_quantity | 주문 수량 | DECIMAL(15,4) | - | Not Null |
| executed_price | 체결 단가 | DECIMAL(15,2) | - |  |
| executed_quantity | 체결 수량 | DECIMAL(15,4) | - | 기본값 0 |
| status | 주문 처리 상태 | ENUM | - | order_status_enum / (PENDING, COMPLETED, CANCELED, FAILED) / 기본값 PENDING |
| created_at | 주문 접수 시간 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |
| completed_at | 주문 처리 완료 시간 | TIMESTAMP | - |  |

### **4-5. OrderExecutionLogs (상세 체결 로그)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 체결 로그 고유 ID | INT | PK | Auto Increment |
| order_id | 대상 주문 ID | INT | FK | Orders(id) 참조 / Not Null |
| executed_price | 체결 가격 | DECIMAL(15,2) | - | Not Null |
| executed_quantity | 체결 수량 | DECIMAL(15,4) | - | Not Null |
| trading_fee | 체결 수수료 | DECIMAL(15,2) | - | 기본값 0 |
| execution_amount | 체결 총액 | DECIMAL(15,2) | - |  |
| executed_at | 체결 시점 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |

### 4-6. Watchlist (관심 종목)

user_id 와 stock_code :  unique 조건 → 중복 관심 종목 추가 방지 

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id |  | BIGINT | PK | AUTO_INCREMENT |
| user_id |  | INT | FK | Not Null |
| stock_code | 종목코드 (=id,  = ticker) | VARCHAR(20) |  | Not Null |
| created_at | 갱신 시간 | TIMESTAMP | - | default: CURRENT_TIMESTAMP |

---

## 5. 랭킹용 [ 추가]

### 5-1. Seasons (시즌 마스터 데이터)

| **변수명** | **설명** | **타입 (Type)** | **Key** | **로직 및 제약조건** |
| --- | --- | --- | --- | --- |
| id | 시즌 고유 ID | INT | PK | Auto Increment |
| name | 시즌명 (예: 2026년 1분기) | VARCHAR(100) | - | Not Null |
| start_date | 시즌 시작일 | DATE | - | Not Null |
| end_date | 시즌 종료일 | DATE | - | Not Null |
| total_days | 시즌 총 일수 | INT | - | 참여율 분모로 사용 |
| status | 시즌 진행 상태 | ENUM | - | ('UPCOMING', 'ACTIVE', 'COMPLETED') |

### 5-2. DailyRankings (매일 밤 12시 갱신되는 랭킹 스냅샷)

| **변수명** | **설명** | **타입 (Type)** | **Key** | **로직 및 제약조건** |
| --- | --- | --- | --- | --- |
| id | 스냅샷 고유 ID | INT | PK | Auto Increment |
| season_id | 대상 시즌 ID | INT | FK | Seasons(id) 참조 / Not Null |
| target_type | 랭킹 대상 | ENUM | - | ('USER', 'TEAM', 'SCHOOL') / Not Null |
| target_id | 유저, 팀, 학교의 ID | INT | - | target_type에 따라 참조하는 ID가 다름 / Not Null |
| rank_date | 랭킹 산정일 | DATE | - | Not Null / (target_type, rank_date, target_id) 복합 인덱스 |
| rank_position | 해당일의 순위 | INT | - | Not Null |
| return_rate | 수익률 (%) | DECIMAL(8,4) | - | 개인/팀 수익률 또는 학교 평균 수익률 |
| final_score | 랭킹 산정 기준 점수 | DECIMAL(10,4) | - | 개인: 수익률 / 팀: 팀점수 / 학교: 가중평균점수 |
| participation_rate | 참여율 (%) | DECIMAL(5,2) | - | 동점자 정렬 기준용 |

---

## 6. 커뮤니티 및 소셜 활동

### **6-1. CommunityPosts (게시글)**

- 수정- 이승희
    
    ```markdown
    > **기존 문제점:**
    > - id 설명이 "알림고유 ID" → 게시글 고유 ID여야 함
    > - user_id 설명이 "알림 받는 유저" → 작성자 유저여야 함
    > - sender_id 컬럼은 게시글에 불필요 (Notifications에서 혼입) → 삭제
    > - type 컬럼의 Key가 "E", 설명이 "알림 유형" → post_type으로 재정의
    >
    > **추가 컬럼:** post_type, stock_code, opinion, deleted_at
    >
    > **삭제 컬럼:** sender_id (Notifications에서 혼입된 불필요 컬럼)
    
    > **CHECK 제약조건 (애플리케이션 레벨에서도 검증):**
    > - 종목토론글: `post_type = 'STOCK_DISCUSSION'` → `stock_code IS NOT NULL AND opinion IS NOT NULL`
    > - 일반게시글: `post_type = 'GENERAL'` → `stock_code IS NULL AND opinion IS NULL`
    ```
    
    | 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
    | --- | --- | --- | --- | --- |
    | id | 게시글 고유 ID | INT | PK | Auto Increment |
    | user_id | 작성자 유저 ID | INT | FK | Users(id) 참조 / Not Null / CASCADE 삭제 / 인덱스(idx_user_id) |
    | post_type | 게시글 유형 | ENUM | - | post_type_enum / ('STOCK_DISCUSSION', 'GENERAL') / Not Null |
    | stock_code | 종목토론 대상 종목 | VARCHAR(20) | FK | Stocks(stock_code) 참조 / 종목토론글: NOT NULL, 일반게시글: NULL / 인덱스(idx_stock_code) |
    | opinion | 투자의견 | ENUM | - | opinion_enum / ('BUY', 'NEUTRAL', 'SELL') / 종목토론글: NOT NULL, 일반게시글: NULL |
    | title | 게시글 제목 | VARCHAR(255) | - | Not Null |
    | content | 게시글 본문 내용 | TEXT | - | Not Null |
    | view_count | 조회수 (캐싱용) | INT | - | Not Null / 기본값 0 |
    | like_count | 좋아요 수 (캐싱용) | INT | - | Not Null / 기본값 0 |
    | comment_count | 댓글 수 (캐싱용) | INT | - | Not Null / 기본값 0 |
    | created_at | 작성 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |
    | updated_at | 수정 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |
    | deleted_at | 소프트 딜리트 시점 | TIMESTAMP | - | NULL = 정상, NOT NULL = 삭제됨 |
- 기존
    
    
    | 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
    | --- | --- | --- | --- | --- |
    | id | 알림고유 ID | INT | PK | Auto Increment |
    | user_id | 알림 받는 유저 | INT | FK | Not Null |
    | sender_id | 알림 발생 시킨 유저 | INT | FK | Not Null |
    | type | 알림 유형 | E | FK | Users(id) 참조 / Not Null / CASCADE 삭제 / 유저별 필터링 인덱스 |
    | title | 게시글 제목 | VARCHAR(255) | - | Not Null |
    | content | 게시글 본문 내용 | TEXT | - | Not Null |
    | view_count | 조회수 (캐싱용) | INT | - | Not Null / 기본값 0 |
    | like_count | 좋아요 수 (캐싱용) | INT | - | Not Null / 기본값 0 |
    | comment_count | 댓글 수 (캐싱용) | INT | - | Not Null / 기본값 0 |
    | created_at | 작성 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |
    | updated_at | 수정 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |

### **6-2. CommunityComments (댓글)**

- 수정
    
    > ****변경:**** deleted_at 추가
    
    ```markdown
    > **소프트 딜리트 정책:**
    > - 게시글이 소프트 딜리트되면 해당 게시글의 모든 댓글도 같이 deleted_at을 세팅
    > - 댓글 단건 삭제 시 해당 댓글만 deleted_at 세팅 + 게시글의 comment_count 갱신
    > - 조회 쿼리 기본 조건: `WHERE deleted_at IS NULL`
    ```
    
    |  변수명  |  설명  |  타입 (Type)  |  Key  |  로직 및 제약조건  |
    | --- | --- | --- | --- | --- |
    |  id  |  댓글 고유 ID  |  INT  |  PK  |  Auto Increment  |
    |  post_id  |  소속 게시글 ID  |  INT  |  FK  |  CommunityPosts(id) 참조 / Not Null / CASCADE 삭제  |
    |  user_id  |  작성자 유저 ID  |  INT  |  FK  |  Users(id) 참조 / Not Null / CASCADE 삭제 / 인덱스(idx_user_id)  |
    |  content  |  댓글 본문 내용  |  TEXT  |  -  |  Not Null  |
    |  like_count  |  좋아요 수 (캐싱용)  |  INT  |  -  |  Not Null / 기본값 0  |
    |  created_at  |  작성 일시  |  TIMESTAMP  |  -  |  기본값 CURRENT_TIMESTAMP  |
    |  updated_at  |  수정 일시  |  TIMESTAMP  |  -  |  기본값 CURRENT_TIMESTAMP  |
    |  deleted_at  |  소프트 딜리트 시점  |  TIMESTAMP  |  -  |  NULL = 정상, NOT NULL = 삭제됨  |
- 기존
    
    
    | 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
    | --- | --- | --- | --- | --- |
    | id | 댓글 고유 ID | INT | PK | Auto Increment |
    | post_id | 소속 게시글 ID | INT | FK | CommunityPosts(id) 참조 / Not Null / CASCADE 삭제 |
    | user_id | 작성자 유저 ID | INT | FK | Users(id) 참조 / Not Null / CASCADE 삭제 / 유저별 필터링 인덱스 |
    | content | 댓글 본문 내용 | TEXT | - | Not Null |
    | like_count | 좋아요 수 (캐싱용) | INT | - | Not Null / 기본값 0 |
    | created_at | 작성 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |
    | updated_at | 수정 일시 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |

### **6-3. PostLikes (게시글 좋아요)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 기록 고유 ID | INT | PK | Auto Increment |
| post_id | 대상 게시글 ID | INT | FK | CommunityPosts(id) 참조 / Not Null / CASCADE 삭제 |
| user_id | 누른 유저 ID | INT | FK | Users(id) 참조 / Not Null / CASCADE 삭제 / (post_id, user_id) 복합 Unique 인덱스 / user_id 단일 인덱스 |
| created_at | 누른 시점 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |

### **6-4. CommentLikes (댓글 좋아요)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 기록 고유 ID | INT | PK | Auto Increment |
| comment_id | 대상 댓글 ID | INT | FK | CommunityComments(id) 참조 / Not Null / CASCADE 삭제 |
| user_id | 누른 유저 ID | INT | FK | Users(id) 참조 / Not Null / CASCADE 삭제 / (comment_id, user_id) 복합 Unique 인덱스 |
| created_at | 누른 시점 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |

### **6-5. Follows (팔로우)**

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id | 기록 고유 ID | INT | PK | Auto Increment |
| follower_id | 팔로우 하는 유저 | INT | FK | Users(id) 참조 / Not Null / CASCADE 삭제 / 팔로잉 조회용 인덱스 |
| followee_id | 팔로우 받는 유저 | INT | FK | Users(id) 참조 / Not Null / CASCADE 삭제 / 팔로워 조회용 인덱스 / (follower_id, followee_id) 복합 Unique 인덱스 |
| created_at | 시작 시점 | TIMESTAMP | - | 기본값 CURRENT_TIMESTAMP |

### 6-6. Notifications (알림)

| 변수명 | 설명 | 타입 (Type) | Key | 로직 및 제약조건 |
| --- | --- | --- | --- | --- |
| id			 | 알림 고유 id | INT | PK | Auto Increment |
| user_id | 알림을 **받는** 유저 | INT | FK | Not Null,
CASCADE 삭제 |
| sender_id | 알림을 **발생시킨** 유저 | INT |  | Not Null,
CASCADE 삭제 |
| type | 알림 유형 | ENUM |  | ENUM('FOLLOWEE_POST', 'POST_LIKE', POST_COMMENT', 'VOTE_START', 'PORTFOLIO_CHANGED') |
| reference_id | 연결될 대상의 id | INT |  |  |
| content | 알림 텍스 | VARCHAR(255) |  |  |
| is_read | 읽음 여부 | BOOLEAN |  |  |
| created_at | 알림 생성 시점 | TIMESTAMP |  | 기본값 CURRENT_TIMESTAMP |

### **6-7. PostStockTags (일반게시글 관련종목 태그) — 신규**

```markdown
> 일반게시글(`post_type = 'GENERAL'`)에서 관련종목을 다중 선택할 수 있도록 하는 N:M 매핑 테이블.
> 종목토론글은 CommunityPosts.stock_code로 직접 연결되므로 이 테이블을 사용하지 않음.
```

|  변수명  |  설명  |  타입 (Type)  |  Key  |  로직 및 제약조건  |
| --- | --- | --- | --- | --- |
|  id  |  태그 고유 ID  |  INT  |  PK  |  Auto Increment  |
|  post_id  |  대상 게시글 ID  |  INT  |  FK  |  CommunityPosts(id) 참조 / Not Null / CASCADE 삭제  |
|  stock_code  |  관련 종목 코드  |  VARCHAR(20)  |  FK  |  Stocks(stock_code) 참조 / Not Null  |
|  created_at  |  태그 생성 시점  |  TIMESTAMP  |  -  |  기본값 CURRENT_TIMESTAMP  |

```markdown
> **인덱스:**
> - (post_id, stock_code) 복합 Unique 인덱스 — 같은 게시글에 같은 종목 중복 태그 방지
> - stock_code 단일 인덱스 — 특정 종목과 관련된 일반게시글 조회용
```

### **6-8. PostViews (게시글 조회 기록) — 신규**

```markdown
> 유저당 1회만 조회수를 카운팅하기 위한 테이블.
> CommunityPosts.view_count는 이 테이블의 COUNT(*)를 주기적으로 동기화하는 캐싱 컬럼.
```

|  변수명  |  설명  |  타입 (Type)  |  Key  |  로직 및 제약조건  |
| --- | --- | --- | --- | --- |
|  id  |  조회 기록 고유 ID  |  INT  |  PK  |  Auto Increment  |
|  post_id  |  대상 게시글 ID  |  INT  |  FK  |  CommunityPosts(id) 참조 / Not Null / CASCADE 삭제  |
|  user_id  |  조회한 유저 ID  |  INT  |  FK  |  Users(id) 참조 / Not Null / CASCADE 삭제  |
|  created_at  |  최초 조회 시점  |  TIMESTAMP  |  -  |  기본값 CURRENT_TIMESTAMP  |

```markdown
> **인덱스:**
> - (post_id, user_id) 복합 Unique 인덱스 — 유저당 1회 조회 보장
>
> **조회수 기록 로직:**
> `INSERT INTO PostViews (post_id, user_id) VALUES (?, ?) ON CONFLICT (post_id, user_id) DO NOTHING`
> → 이미 조회한 유저는 무시, 새 유저만 기록
```