'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

const toRows = (result) => {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
};

const columnExists = (db, table, column) =>
  db
    .runSql(
      'SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, column]
    )
    .then((result) => toRows(result)[0].cnt > 0);

const tableExists = (db, table) =>
  db
    .runSql(
      'SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
      [table]
    )
    .then((result) => toRows(result)[0].cnt > 0);

exports.up = function (db) {
  return (
    Promise.resolve()
      // 1. Portfolios: status ENUM에 DRAFT, ARCHIVED 추가
      .then(() =>
        db.runSql(
          "ALTER TABLE Portfolios MODIFY COLUMN status ENUM('DRAFT','PENDING','APPROVED','REJECTED','ARCHIVED') NOT NULL DEFAULT 'DRAFT'"
        )
      )
      // 2. Portfolios: description (투자근거)
      .then(() => columnExists(db, 'Portfolios', 'description'))
      .then((exists) =>
        exists ? null : db.runSql('ALTER TABLE Portfolios ADD COLUMN description TEXT NULL AFTER title')
      )
      // 3. Portfolios: analysis (상세분석)
      .then(() => columnExists(db, 'Portfolios', 'analysis'))
      .then((exists) =>
        exists ? null : db.runSql('ALTER TABLE Portfolios ADD COLUMN analysis TEXT NULL AFTER description')
      )
      // 4. Portfolios: type (NEW / REVISION)
      .then(() => columnExists(db, 'Portfolios', 'type'))
      .then((exists) =>
        exists
          ? null
          : db.runSql(
              "ALTER TABLE Portfolios ADD COLUMN type ENUM('NEW','REVISION') NOT NULL DEFAULT 'NEW' AFTER team_id"
            )
      )
      // 5. Portfolios: parent_id (수정안일 때 원본 MP)
      .then(() => columnExists(db, 'Portfolios', 'parent_id'))
      .then((exists) =>
        exists
          ? null
          : db.runSql(
              'ALTER TABLE Portfolios ADD COLUMN parent_id INT NULL AFTER type'
            )
      )
      // 6. PortfolioAllocations: reason (종목별 근거)
      .then(() => columnExists(db, 'PortfolioAllocations', 'reason'))
      .then((exists) =>
        exists
          ? null
          : db.runSql('ALTER TABLE PortfolioAllocations ADD COLUMN reason TEXT NULL AFTER target_percentage')
      )
      // 7. TradeProposals 테이블 생성
      .then(() => tableExists(db, 'TradeProposals'))
      .then((exists) =>
        exists
          ? null
          : db.runSql(`
              CREATE TABLE TradeProposals (
                id               INT           NOT NULL AUTO_INCREMENT,
                team_id          INT           NOT NULL,
                proposed_by      INT           NOT NULL,
                stock_code       VARCHAR(20)   NOT NULL,
                order_type       ENUM('BUY','SELL') NOT NULL,
                quantity         INT           NOT NULL,
                target_price     DECIMAL(18,2) NOT NULL,
                rationale        TEXT          NOT NULL,
                market_analysis  TEXT          NULL,
                risk_analysis    TEXT          NULL,
                approval_count   INT           NOT NULL DEFAULT 0,
                rejection_count  INT           NOT NULL DEFAULT 0,
                status           ENUM('PENDING','APPROVED','REJECTED','EXECUTED') NOT NULL DEFAULT 'PENDING',
                created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX idx_tp_team_status (team_id, status),
                INDEX idx_tp_proposer (proposed_by),
                CONSTRAINT fk_tp_team
                  FOREIGN KEY (team_id) REFERENCES Teams(id) ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT fk_tp_proposer
                  FOREIGN KEY (proposed_by) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT fk_tp_stock
                  FOREIGN KEY (stock_code) REFERENCES Stocks(stock_code) ON UPDATE CASCADE
              ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `)
      )
      // 8. TradeProposalVotes 테이블 생성
      .then(() => tableExists(db, 'TradeProposalVotes'))
      .then((exists) =>
        exists
          ? null
          : db.runSql(`
              CREATE TABLE TradeProposalVotes (
                id           INT       NOT NULL AUTO_INCREMENT,
                proposal_id  INT       NOT NULL,
                voter_id     INT       NOT NULL,
                is_approved  BOOLEAN   NOT NULL,
                created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_tpv_proposal_voter (proposal_id, voter_id),
                INDEX idx_tpv_voter (voter_id),
                CONSTRAINT fk_tpv_proposal
                  FOREIGN KEY (proposal_id) REFERENCES TradeProposals(id) ON DELETE CASCADE ON UPDATE CASCADE,
                CONSTRAINT fk_tpv_voter
                  FOREIGN KEY (voter_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
              ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `)
      )
  );
};

exports.down = function (db) {
  return (
    Promise.resolve()
      .then(() => tableExists(db, 'TradeProposalVotes'))
      .then((exists) => (exists ? db.runSql('DROP TABLE TradeProposalVotes') : null))
      .then(() => tableExists(db, 'TradeProposals'))
      .then((exists) => (exists ? db.runSql('DROP TABLE TradeProposals') : null))
      .then(() => columnExists(db, 'PortfolioAllocations', 'reason'))
      .then((exists) => (exists ? db.runSql('ALTER TABLE PortfolioAllocations DROP COLUMN reason') : null))
      .then(() => columnExists(db, 'Portfolios', 'parent_id'))
      .then((exists) => (exists ? db.runSql('ALTER TABLE Portfolios DROP COLUMN parent_id') : null))
      .then(() => columnExists(db, 'Portfolios', 'type'))
      .then((exists) => (exists ? db.runSql('ALTER TABLE Portfolios DROP COLUMN type') : null))
      .then(() => columnExists(db, 'Portfolios', 'analysis'))
      .then((exists) => (exists ? db.runSql('ALTER TABLE Portfolios DROP COLUMN analysis') : null))
      .then(() => columnExists(db, 'Portfolios', 'description'))
      .then((exists) => (exists ? db.runSql('ALTER TABLE Portfolios DROP COLUMN description') : null))
      .then(() =>
        db.runSql(
          "ALTER TABLE Portfolios MODIFY COLUMN status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING'"
        )
      )
  );
};

exports._meta = { version: 1 };
