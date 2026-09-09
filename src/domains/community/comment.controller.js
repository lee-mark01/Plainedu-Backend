const commentService = require('./comment.service');

// 댓글 생성
const createComment = async (req, res, next) => {
    try {
        const post_id = Number(req.params.post_id);
        const user_id = req.user.userId;
        const { parent_id, content } = req.validated;
        const comment = await commentService.createComment(user_id, post_id, content, parent_id);
        res.status(201).json({ success: true, data: comment });
    } catch (err) {
        next(err);
    }
};

// 댓글 수정
const updateComment = async (req, res, next) => {
    try {
        const comment_id = Number(req.params.comment_id);
        const user_id = req.user.userId;
        const { content } = req.validated;
        const comment = await commentService.updateComment(user_id, comment_id, content);
        res.status(200).json({ success: true, data: comment });
    } catch (err) {
        next(err);
    }
};

// 댓글 삭제
const deleteComment = async (req, res, next) => {
    try {
        const comment_id = Number(req.params.comment_id);
        const user_id = req.user.userId;
        await commentService.deleteComment(user_id, comment_id);
        res.status(200).json({ success: true, message: '댓글이 삭제되었습니다.' });
    } catch (err) {
        next(err);
    }
};

// 댓글 목록 조회
const getCommentsByPostId = async (req, res, next) => {
    try {
        const post_id = Number(req.params.post_id);
        const comments = await commentService.getCommentsByPostId(post_id, req.user?.userId);
        res.status(200).json({ success: true, data: comments });
    } catch (err) {
        next(err);
    }
};

module.exports = { createComment, updateComment, deleteComment, getCommentsByPostId };