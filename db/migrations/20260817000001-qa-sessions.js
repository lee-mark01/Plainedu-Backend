'use strict';

const fs = require('fs');
const path = require('path');

let PromiseImpl;

exports.setup = function (options) {
  PromiseImpl = options.Promise;
};

const runFile = (db, filename) => {
  const filePath = path.join(__dirname, 'sqls', filename);
  return new PromiseImpl((resolve, reject) => {
    fs.readFile(filePath, { encoding: 'utf-8' }, (error, data) => {
      if (error) return reject(error);
      resolve(data);
    });
  }).then((sql) => db.runSql(sql));
};

exports.up = (db) => runFile(db, '20260817000001-qa-sessions-up.sql');
exports.down = (db) => runFile(db, '20260817000001-qa-sessions-down.sql');
exports._meta = { version: 1 };
