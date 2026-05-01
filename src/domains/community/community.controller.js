// TODO: 컨트롤러 구현
const communityService = require('./community.service');

const createPost = async (req, res, next) => {
  try {
    const value = req.validatedBody; // validate 미들웨어에서 검증된 데이터
    const { user_id, post_type, stock_code, opinion, title, content } = value;
    const postId = await communityService.createPost(user_id, post_type, stock_code, opinion, title, content);
    res.json({ success: true, data: postId });
  } catch (err) {
    next(err);
  }
};

const getPostById = async (req, res, next) => {
  try {
    const postId = req.params.id;
    const post = await communityService.getPostById(postId);
    res.json({ success: true, data: post });
  } catch (err) {
    next(err);
  }
};

module.exports = { createPost, getPostById };
