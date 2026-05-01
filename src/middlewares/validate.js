// 공통 validate 미들웨어
const AppError = require('../errors/AppError');

// schema,  검증 미들웨어
const validate = (schema, source = 'body') => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req[source], { abortEarly: false }); // source: body, query, params 등
        if (error) {
            throw new AppError(error.details[0].message, 400);
        }
        req.validated = value; // 검증된 데이터 저장
        next();
    };
};

module.exports = validate;