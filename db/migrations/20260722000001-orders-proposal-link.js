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

// 팀 주문이 어떤 매매 제안(TradeProposal)을 참고해서 실행됐는지 느슨하게 기록 (참고용 — 값 일치 강제 없음)
exports.up = function (db) {
  return Promise.resolve()
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

exports.down = function (db) {
  return Promise.resolve()
    .then(() => columnExists(db, 'Orders', 'proposal_id'))
    .then((exists) =>
      exists
        ? db.runSql('ALTER TABLE Orders DROP FOREIGN KEY fk_orders_proposal, DROP COLUMN proposal_id')
        : null
    );
};

exports._meta = { version: 1 };
