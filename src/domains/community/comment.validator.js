const Joi = require('joi');

// 댓글 작성 스키마
const createCommentSchema = Joi.object({
    parent_id: Joi.number().integer().allow(null),
    content: Joi.string().trim().required()
});

// 댓글 수정 스키마
const updateCommentSchema = Joi.object({
    content: Joi.string().trim().required()
});

module.exports = { createCommentSchema, updateCommentSchema };
