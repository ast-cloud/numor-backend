const authService = require("./auth.service");
const { deleteChatHistory } = require("../ai/chatbot/chat.service")
const { FRONTEND_URL } = require("../../config/env");

async function register(req, res) {
  console.log("New registration attempt:", req.body);
  try {
    const { token, user } = await authService.registerUser(req.body);

    // res.cookie("access_token", token, {
    //   httpOnly: true,
    //   secure: process.env.NODE_ENV === "production",
    //   sameSite: "none",
    //   domain: process.env.NODE_ENV === "production" ? ".numor.app" : "localhost",
    //   maxAge: 7 * 24 * 60 * 60 * 1000,
    // });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        token,
        // user 
      },
    });
  } catch (error) {
    // res.clearCookie("access_token");
    console.error("Registration error:", error);
    res.status(400).json({
      success: false,
      message: "Registration failed",
    });
  }
}

async function login(req, res) {
  console.log("New login attempt:", req.body);
  try {

    const { email, password } = req.body;

    const { token, safeUser } = await authService.loginUser(email, password);

    // res.cookie("access_token", token, {
    //   httpOnly: true,
    //   secure: process.env.NODE_ENV === "production",
    //   sameSite: "none", // or "lax"
    //   // domain: process.env.NODE_ENV === "production" ? ".numor.app" : "localhost",
    //   maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    // });

    res.json({
      success: true,
      message: "Login successful",
      data: {
        token,
        safeUser, // safe user info
      },
    });
  } catch (error) {
    // res.clearCookie("access_token");
    console.error("Login error:", error.message);
    res.status(401).json({
      success: false,
      message: "Invalid email or password",
    });
  }
}

async function logout(req, res) {
  console.log("Logout attempt:", req.loggedInUser);
  // res.clearCookie("access_token", {
  //   httpOnly: true,
  //   secure: process.env.NODE_ENV === "production",
  //   sameSite: "none",
  //   // domain: ".numor.app",
  // });
  try {
    const result = await deleteChatHistory(req.loggedInUser);

    res.json({
      success: true,
      message: "Logout successful. Chat history cleared.",
      result
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
}

async function googleLogin(req, res, next) {
  console.log("New Google login attempt:", req.body);
  try {
    const { code, user_type_for_signup } = req.body;
    const { token, user } = await authService.googleAuth(code, user_type_for_signup);

    // res.cookie("access_token", token, {
    //   httpOnly: true,
    //   secure: process.env.NODE_ENV === "production",
    //   sameSite: "none",
    //   // domain: process.env.NODE_ENV === "production" ? ".numor.app" : "localhost",
    //   maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    // });
    res.json({
      success: true,
      message: "Google login successful",
      data: {
        token,
        user,
      },
    });
  } catch (err) {
    // res.clearCookie("access_token");
    next(err);
  }
}


async function linkedinLogin(req, res, next) {
  console.log("New LinkedIn login attempt:", req.body);
  try {
    const { code, user_type_for_signup } = req.body;

    const { token, user } = await authService.linkedinAuth(
      code,
      user_type_for_signup
    );

    res.json({
      success: true,
      message: "LinkedIn login successful",
      data: {
        token,
        user,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function googleLocalStorageBasedLogin(req, res, next) {
  console.log("New Google login attempt:", req.query);
  const { state, code } = req.query;
  let user_type_for_signup = undefined;

  if (state) {
    try {
      const parsed = JSON.parse(Buffer.from(state, "base64").toString());
      user_type_for_signup = parsed.user_type_for_signup;
    }
    catch (err) {
      console.error("Failed to parse state parameter:", err);
      return res.status(400).json({
        success: false,
        message: "Invalid state parameter",
      });
    }
  }

  try {

    const { token, user } = await authService.googleAuth(code, user_type_for_signup);

    const redirectPath = user?.role === "CA_USER" ? "/ca/dashboard" : "/sme/dashboard";

    // Token in hash fragment so it's never sent to servers
    res.redirect(`${FRONTEND_URL}/auth/callback#token=${token}&redirect=${redirectPath}`);
  }
  catch (err) {
    console.error("Google auth failed:", err);
    res.redirect(`${FRONTEND_URL}/login?error=google_auth_failed`);
  }

}

async function verifyEmail(req, res) {
  console.log("Email verification attempt:", req.body);
  try {
    const { email } = req.body;

    const result = await authService.verifyEmail(email);

    res.json({
      success: result.success,
      result
    });
  } catch (error) {
    console.log("Email verification error:", error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function verifyEmailOtp(req, res) {
  console.log("Email OTP verification attempt:", req.body);
  try {
    const { email, code } = req.body;

    const result = await authService.verifyEmailOTP(email, code);

    res.json({
      success: true,
      message: "Verification Successful",
      result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function forgetPassword(req, res) {
  console.log("Forget password attempt:", req.body);
  try {
    const { email } = req.body;

    const result = await authService.forgetPassword(email);

    res.json({
      success: true,
      message: "Verification code sent to email",
      result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function verifyCode(req, res) {
  console.log("Verify reset code attempt:", req.body);
  try {
    const { email, code } = req.body;

    await authService.verifyResetCode(email, code);

    res.json({
      success: true,
      message: "Code verified"
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function resetUserPassword(req, res) {
  console.log("Reset password attempt:", req.body);
  try {
    const { email, code, newPassword } = req.body;

    await authService.resetPassword(email, code, newPassword);

    res.json({
      success: true,
      message: "Password updated successfully"
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

async function verifyInvitation(req, res) {
  console.log("Verify invitation attempt:", req.body);
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Invitation token is required",
      });
    }

    const invitation = await authService.verifyInvitation(token);

    res.json({
      success: true,
      message: "Invitation is valid",
      data: invitation,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

async function createSubAccount(req, res) {
  console.log("Create sub-account attempt:", req.body);
  try {
    const { token, name, password, phone } = req.body;

    if (!token || !name || !password) {
      return res.status(400).json({
        success: false,
        message: "Token, name and password are required",
      });
    }

    const result = await authService.createSubAccount({
      token,
      name,
      password,
      phone,
    });

    res.status(201).json({
      success: true,
      message: "Sub-account created successfully",
      data: result,
    });
  } catch (error) {
    console.error("Create sub-account error:", error.message);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

module.exports = {
  register,
  login,
  logout,
  googleLogin,
  googleLocalStorageBasedLogin,
  forgetPassword,
  resetUserPassword,
  verifyCode,
  verifyInvitation,
  createSubAccount,
  verifyEmail,
  verifyEmailOtp,
  linkedinLogin
};
