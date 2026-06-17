const AppError = require('../../errors/AppError');
const commentRepository = require('./comment.repository');
const postRepository = require('./post.repository');
const notificationService = require('./notification.service');

// 댓글 생성
const createComment = async (user_id, post_id, content, parent_id) => {
    const post = await postRepository.findById(post_id);
    if (!post) {
        throw new AppError('Post not found', 404);
    }

    let parentComment = null;
    if (parent_id) {
        parentComment = await commentRepository.findById(parent_id);
        if (!parentComment) {
            throw new AppError('Parent comment not found', 404);
        }
    }

    const id = await commentRepository.save(user_id, post_id, content, parent_id);
    const comment = await commentRepository.findById(id);

    // 알림: 대댓글이면 부모 댓글 작성자에게, 아니면 게시글 작성자에게
    if (parentComment) {
        await notificationService.createNotification(
            parentComment.user_id, user_id, 'COMMENT_REPLY', id, content
        );
    } else {
        await notificationService.createNotification(
            post.user_id, user_id, 'POST_COMMENT', id, content
        );
    }

    return comment;
};

// 댓글 수정
const updateComment = async (user_id, comment_id, content) => {
    const comment = await commentRepository.findById(comment_id);
    if (!comment) {
        throw new AppError('Comment not found', 404);
    }
    if (comment.user_id !== user_id) {
        throw new AppError('Forbidden', 403);
    }
    await commentRepository.update(comment_id, content);
    return await commentRepository.findById(comment_id);
};

// 댓글 삭제
const deleteComment = async (user_id, comment_id) => {
    const comment = await commentRepository.findById(comment_id);
    if (!comment) {
        throw new AppError('Comment not found', 404);
    }
    if (comment.user_id !== user_id) {
        throw new AppError('Forbidden', 403);
    }
    await commentRepository.softDelete(comment_id);
};

// 댓글 목록 조회 (댓글 + 대댓글 트리 구조)
const getCommentsByPostId = async (post_id) => {
    const post = await postRepository.findById(post_id);
    if (!post) {
        throw new AppError('Post not found', 404);
    }
    const comments = await commentRepository.findByPostId(post_id);

    // 트리 구조로 변환: 댓글 → 대댓글
    const commentMap = new Map();
    const roots = [];

    for (const comment of comments) {
        comment.replies = [];
        commentMap.set(comment.id, comment);
    }
    for (const comment of comments) {
        if (comment.parent_id) {
            const parent = commentMap.get(comment.parent_id);
            if (parent) {
                parent.replies.push(comment);
            }
        } else {
            roots.push(comment);
        }
    }
    return roots;
};

module.exports = { createComment, updateComment, deleteComment, getCommentsByPostId };