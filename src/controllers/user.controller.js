import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";


const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId)
        const refreshToken = user.generateRefreshToken();
        const accessToken = user.generateAccessToken();

        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false});

        return {accessToken, refreshToken};


    } catch (error) {
        throw new ApiError(500, "Failed to generate access and refresh tokens")
    }
}


const registerUser = asyncHandler(async (req, res) => {
    //get user details from frontend
    //validate user details - not empty
    //check if user already exists: username, email
    //check for images, check for avatar
    //upload images to cloudinary, avatar
    //create user object - create entry in db
    //remove password and refresh token from response
    //check for user creation
    //return response


    // Get user details from request body
    const {username, email, fullName, password} = req.body
    console.log("email: ", email);



    // Validate user details
    if(
        [fullName, username, email, password].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required")
    }



    // Check if user already exists
    const existedUser = await User.findOne({
        $or: [
            {username},
            {email}
        ]
    })
    if(existedUser) {
        throw new ApiError(409, "User already exists with this username or email")
    }



    // Check for images
    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;
    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar is required")
    }



    // Upload images to cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if(!avatar) {
        throw new ApiError(500, "failed to upload avatar image");
    }



    // Create user object
    const user = await User.create({
        fullName,
        username: username.toLowerCase(),
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
    })



    // Remove password and refresh token from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )



    // Check for user creation
    if(!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user");
    }



    // Return response 
    return res.status(201).json(
        new ApiResponse(201, createdUser, "User registered successfully")
    )
})

const loginUser = asyncHandler( async (req, res) => {
    //Get User details from frontend
    //validate user details - not empty 
    //check if user exists with username or email 
    //check password
    //access and refresh token
    //send cookie
    //return response



    //Get User details from frontend:
    const {email, username, password} = req.body



    //validate user details not empty: 
    if(!(username || email)) {
        throw new ApiError(400, "Enter Username or Email")
    }



    //check if user exists with this username or email: 
    const user = await User.findOne(
        username
            ? {username: username.toLowerCase()}
            : {email: email.toLowerCase()}
    )
    if(!user) {
        throw new ApiError(404, "User does not exist")
    }



    //check password: 
    const isPasswordValid = await user.isPasswordCorrect(password)
    if(!isPasswordValid) {
        throw new ApiError(401, "Enter correct Password")
    }



    //access and refresh token: 
    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");



    //send cookie:
    const options = {
        httpOnly: true,              //by default the cookie is accessible by everyone, so setting httpOnly and secure true will make it accessible only by the server
        secure: true
    }

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(200, {user: loggedInUser, accessToken, refreshToken}, "User logged in successfully"));



})

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true,
        expires: new Date(0)
    }


    return res
        .status(200)
        .cookie("accessToken", "", options)
        .cookie("refreshToken", "", options)
        .json(new ApiResponse(200, {}, "User logged out successfully"));
})


const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken) {
        throw new ApiError(401, "unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id)
        if(!user) {
            throw new ApiError(401, "Invalid RefreshToken")
        }
    
        if(incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh Token expired or used")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(new ApiResponse(200, {accessToken, refreshToken: newRefreshToken}, "Access token refreshed"))
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid Refresh token")
    }

})

export { registerUser, loginUser, logoutUser, refreshAccessToken };