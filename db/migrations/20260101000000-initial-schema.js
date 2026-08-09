'use strict';

const fs = require('fs');
const path = require('path');

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

exports.up = function (db) {
  const filePath = path.join(__dirname, 'sqls', '20260101000000-initial-schema-up.sql');
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, { encoding: 'utf-8' }, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  }).then((data) => db.runSql(data));
};

exports.down = function (db) {
  const filePath = path.join(__dirname, 'sqls', '20260101000000-initial-schema-down.sql');
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, { encoding: 'utf-8' }, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  }).then((data) => db.runSql(data));
};

exports._meta = { version: 1 };
