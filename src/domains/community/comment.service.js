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
    await commentRepository.softDelete(comment_id, comment.post_id);
};

// 삭제된 댓글의 자리표시 — 답글을 살려두기 위해 껍데기만 남긴다
const toTombstone = (comment) => ({
    id: comment.id,
    post_id: comment.post_id,
    parent_id: comment.parent_id,
    user_id: null,
    author_nickname: null,
    content: null,
    like_count: 0,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
    is_deleted: true,
    replies: comment.replies,
});

const toVisible = ({ deleted_at, ...comment }) => ({ ...comment, is_deleted: false });

// 삭제된 댓글은 살아있는 답글이 남아있을 때만 자리표시로 남기고, 아니면 트리에서 제거한다.
// (자식부터 처리해야 "삭제된 부모 + 전부 삭제된 답글"이 통째로 사라진다)
const pruneDeleted = (nodes) =>
    nodes.reduce((kept, comment) => {
        comment.replies = pruneDeleted(comment.replies);

        if (!comment.deleted_at) {
            kept.push(toVisible(comment));
        } else if (comment.replies.length > 0) {
            kept.push(toTombstone(comment));
        }
        return kept;
    }, []);

// 평면 목록 → 댓글/대댓글 트리. 순수 함수(DB 무관)라 단위 테스트 대상.
const buildCommentTree = (comments) => {
    const commentMap = new Map();
    const roots = [];

    for (const comment of comments) {
        comment.replies = [];
        commentMap.set(comment.id, comment);
    }
    for (const comment of comments) {
        const parent = comment.parent_id ? commentMap.get(comment.parent_id) : null;
        if (parent) {
            parent.replies.push(comment);
        } else {
            roots.push(comment); // 부모가 목록에 없으면 고아가 되지 않게 루트로 올린다
        }
    }
    return pruneDeleted(roots);
};

// 댓글 목록 조회 (댓글 + 대댓글 트리 구조)
const getCommentsByPostId = async (post_id) => {
    const post = await postRepository.findById(post_id);
    if (!post) {
        throw new AppError('Post not found', 404);
    }
    return buildCommentTree(await commentRepository.findByPostId(post_id));
};

module.exports = { createComment, updateComment, deleteComment, getCommentsByPostId, buildCommentTree };