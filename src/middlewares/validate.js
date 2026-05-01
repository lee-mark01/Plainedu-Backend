// 공통 validate 미들웨어
const AppError = require('../errors/AppError');

const validate = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body);
        if (error) {
            throw new AppError(error.details[0].message, 400);
        }
        req.validatedBody = value; // 검증된 데이터를 req 객체에 저장
        next();
    };
};

module.exports = validate;