import joi from 'joi'
import { AppError } from '../utils/appError.js'
import { discountTypes } from '../utils/constant/enum.js'
const parseArray = (value , helper)=>{
  let data = JSON.parse(value)
  let schema = joi.array().items(joi.string())
 const {error} = schema.validate(data)
 if(error){
  return helper(error.details)
 }
  return true
}
export const generalFields = {
    name: joi.string(),
    description: joi.string().max(2000),
    objectId :joi.string().hex().length(24),
    stock: joi.number().positive(),
    price: joi.number().positive(),
    discount: joi.number(),
    discountType: joi.string().valid(...Object.values(discountTypes)),
    colors: joi.custom(parseArray),
    sizes: joi.custom(parseArray),
    rate: joi.number().min(1).max(5),
    email: joi.string().email(),
    phone: joi.string().pattern(new RegExp(/^[\+]?[0-9]{0,3}[\W]?[0-9]{3}[\W]?[0-9]{3}[\W]?[0-9]{4,6}$/im
)),
    password: joi.string().pattern(new RegExp(/^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{6,16}$/)),
    cPassword : joi.string().valid(joi.ref('password')),
    DOB: joi.string(),
    otp: joi.string().length(6).required(),
}
export const isValid = (schemas) => {
  return (req, res, next) => {
    const targets = ['body', 'params', 'query'];

    for (const key of targets) {
      if (schemas[key]) {
        const { error } = schemas[key].validate(req[key], { abortEarly: false });

        if (error) {
          const errArray = error.details.map(err => err.message);
          return next(new AppError(errArray, 400));
        }
      }
    }

    next();
  };
};
