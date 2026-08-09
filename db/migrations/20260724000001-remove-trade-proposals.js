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

const constraintExists = (db, table, constraint) =>
  db
    .runSql(
      'SELECT COUNT(*) AS cnt FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?',
      [table, constraint]
    )
    .then((result) => toRows(result)[0].cnt > 0);

// 개별매매제안(TradeProposals) 기능 제거: 테이블 삭제 + Orders.proposal_id 컬럼 제거
exports.up = function (db) {
  return Promise.resolve()
    // 1. Orders.proposal_id FK 및 컬럼 제거 (TradeProposals 삭제 전에 해야 함)
    .then(() => constraintExists(db, 'Orders', 'fk_orders_proposal'))
    .then((exists) =>
      exists ? db.runSql('ALTER TABLE Orders DROP FOREIGN KEY fk_orders_proposal') : null
    )
    .then(() => columnExists(db, 'Orders', 'proposal_id'))
    .then((exists) =>
      exists ? db.runSql('ALTER TABLE Orders DROP COLUMN proposal_id') : null
    )
    // 2. TradeProposalVotes 삭제 (FK가 TradeProposals를 참조하므로 먼저)
    .then(() => tableExists(db, 'TradeProposalVotes'))
    .then((exists) => (exists ? db.runSql('DROP TABLE TradeProposalVotes') : null))
    // 3. TradeProposals 삭제
    .then(() => tableExists(db, 'TradeProposals'))
    .then((exists) => (exists ? db.runSql('DROP TABLE TradeProposals') : null));
};

exports.down = function (db) {
  return Promise.resolve()
    // TradeProposals 복원
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
    // TradeProposalVotes 복원
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
    // Orders.proposal_id 복원
    .then(() => columnExists(db, 'Orders', 'proposal_id'))
    .then((exists) =>
      exists
        ? null
        : db.runSql(
            `ALTER TABLE Orders
               ADD COLUMN proposal_id INT NULL AFTER account_id,
               ADD CONSTRAINT fk_orders_proposal
                 FOREIGN KEY (proposal_id) REFERENCES TradeProposals(id) ON DELETE SET NULL ON UPDATE CASCADE`
          )
    );
};

exports._meta = { version: 1 };
