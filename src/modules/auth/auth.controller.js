import bcrypt, { hashSync } from 'bcrypt'
import { Cart, User } from "../../../database/index.js"
import { AppError } from "../../utils/appError.js"
import { messages } from "../../utils/constant/messages.js"
import { sendEmail } from '../../utils/email.js'
import { generateToken, verifyToken } from '../../utils/token.js'
import { status } from '../../utils/constant/enum.js'
import { generateOTP } from '../../utils/generateOTP.js'


// signup
export const signup = async(req,res,next)=>{
    // get data from req
    let {name, email , password , phone } = req.body
    // check existance
    const userExist = await User.findOne({$or: [{email},{phone}]})
    if(userExist){
        return next(new AppError(messages.user.alreadyExist ,409))
    }
    // prepare data
    password = bcrypt.hashSync(password,8)
    const user = new User({
        name,
        email,
        password,
        phone
    })
    // add to database
    const createdUser = await user.save()
    if(!createdUser){
        return next(new AppError(messages.user.failToCreate ,500))
    }
    // generate token
   const token =  generateToken({payload:{email , _id : createdUser._id} })
    // send email
    sendEmail({
        to: email ,
        subject:"verify your account" , 
        html :`<p>to verify your account click <a href='${req.protocol}://${req.headers.host}/auth/verify/${token}'>link</a></p>`})
     
    // send response
    return res.status(201).json({
        message: messages.user.createdSuccessfully,
        success: true,
        data: createdUser
    })

}
// verify account
export const verifyAccount = async(req,res,next) =>{
    //get data from request
        const {token} = req.params
        const payload = verifyToken({token})
        await User.findOneAndUpdate({email:payload.email, status: "Pending"},{status:"Verified"})
        await Cart.create({user: payload._id , products: []})
        return res.status(200).json({
            message: "User Verified Successfully",
            success: true,
        })      
}
// resent otp code
export const resendOtp = async(req,res,next) =>{
    const { email } = req.body;
    //const token =  generateToken({payload:{email , _id : createdUser._id} })
    const user = await User.findOne({email})
    if(!user){
        return next(new AppError(messages.user.invalidCredentials, 404))
    }
    if(user.confirmEmail === true){
        return next(new AppError("Email already confirmed", 400))
    }
    const currentDate = new Date()
    if (user.otpExpired > currentDate) {
        const timeDifference = (user.otpExpired - currentDate) / (1000 * 60); // Difference in minutes
        return next(new AppError(`Last OTP still valid, you can try after ${timeDifference.toFixed(2)} minutes`, 400));
    }
     // Generate new OTP and expiration
     const otp = generateOTP();
     const otpExpired = Date.now() + 9 * 60 * 1000;
     
     // Update user with new OTP and expiration
     user.otp = otp;
     user.otpExpired = otpExpired;
     await user.save();
     
    sendEmail({
        to: email ,
        subject:"Resend OTP" , 
        html :`<h1> Your OTP is ${otp} </h1> `
    })

     // Send response
     return res.status(200).json({
        message: "OTP Resent Successfully",
        success: true,
    });
}
// login
export const login = async(req,res,next)=>{
    //get data from req
    const {email , phone , password} = req.body
    // check existanse
    const userExist = await User.findOne({$or : [{email} , {phone}], status: "Verified"})
    if(!userExist){
        return next(new AppError(messages.user.invalidCredentials , 400))
    }
    // check password
    const match = bcrypt.compareSync(password , userExist.password)
    if(!match){
        return next(new AppError(messages.user.invalidCredentials , 400))
    }
    // update isDeleted
    userExist.isDeleted = false
    await userExist.save()
    // generate token
    const token = generateToken({payload:{_id: userExist._id , email}})
    // send response
    return res.status(200).json({
        message: "Login Successfully", 
        success: true ,
        token
    })
}
// update password 
export const updatePassword = async(req,res,next) =>{
    const { email, oldPassword, newPassword } = req.body;
    const userId =  req.params.userId
    const authUserId = req.authUser?._id

    // Ensure the logged-in user is the owner of the account they are trying to update
    if (authUserId.toString() !== userId) {
        return next(new AppError(messages.user.notAuthorized, 403)); // Forbidden if not the owner
    }
    // check existanse
    const userExist = await User.findOne({email})
    if(!userExist){
        return next(new AppError(messages.user.invalidCredentials , 400))
    }
    // check password
    const match = bcrypt.compare(oldPassword , userExist.password)
    if(!match){
        return next(new AppError(messages.user.invalidCredentials , 400))
    }
    // update 
    const hashedPassword = bcrypt.hashSync(newPassword, 8);
    // Update the password in the database
    userExist.password = hashedPassword;
    await userExist.save();
    // send response
    return res.status(200).json({
        message: "Password Updated Successfully,",
        success: true,
    })
}
// Forget password 
export const sendForgetCode = async (req,res,next) => {

    const { email } = req.body;

    // Check if the user exists
    const user = await User.findOne({ email });
    if (!user) {
        return next(new AppError(messages.user.notFound, 404));
    }

    // Generate OTP and its expiration time
    const otp = generateOTP(); 
    const otpExpired = Date.now() + 9 * 60 * 1000; 

    // Hash the OTP before saving it in the database
    const hashedOTP = bcrypt.hashSync(otp, 8);
    user.otp = hashedOTP;
    user.otpExpired = otpExpired;
    await user.save();

    // Send OTP via email or SMS (preferably email)
    await sendEmail({
        to: email,
        subject: "Password Reset OTP",
        text: `Your OTP is ${otp}. It will expire in 9 minutes.`,
    });

    // Send response
    return res.status(200).json({
        message: "OTP sent to your email successfully",
        success: true,
    });
}
// reset password
export const resetPassword = async(req,res,next) => {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    const otp = generateOTP(); 
    const hashedOtp = bcrypt.hashSync(otp, 8);

    user.otp = hashedOtp;
    user.otpExpired = Date.now() + 9 * 60 * 1000; // 9 minutes

    await user.save();

    // TODO: send OTP to user via email
    console.log("OTP to send (for testing):", otp);

    res.status(200).json({
        message: "OTP sent successfully",
        success: true,
    });
}