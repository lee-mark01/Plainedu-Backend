const express = require('express');
const router = express.Router();
const schoolController = require('./school.controller');
const validate = require('../../middlewares/validate');
const authenticate = require('../../middlewares/authenticate');
const { syncSchoolsSchema, searchSchoolsSchema } = require('./school.validator');

// 학교 검색 (공개)
router.get('/', validate(searchSchoolsSchema, 'query'), schoolController.searchSchools);

// 커리어넷 동기화 (관리자 전용)
router.post('/sync', authenticate, validate(syncSchoolsSchema), schoolController.syncSchools);

module.exports = router;
