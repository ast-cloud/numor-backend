const authService = require("./auth.service");

async function register(req, res) {
  try {
    const { token, user } = await authService.registerUser(req.body);

    res.cookie("access_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      // data: { user },
    });
  } catch (error) {
    res.clearCookie("access_token");
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    const { token, safeUser } = await authService.loginUser(email, password);

    res.cookie("access_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax", // or "lax"
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      message: "Login successful",
      data: {
        safeUser, // safe user info
      },
    });
  } catch (error) {
    res.clearCookie("access_token");
    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
}

async function logout(req, res) {
  res.clearCookie("access_token", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
  });
  res.json({
    success: true,
    message: "Logout successful",
  });
}

async function googleLogin(req, res, next) {
  try {
    const { code, user_type_for_signup } = req.body;
    const { token, user } = await authService.googleAuth(code, user_type_for_signup);

    res.cookie("access_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    res.json({
      success: true,
      message: "Google login successful",
      data: {
        user,
      },
    });
  } catch (err) {
    res.clearCookie("access_token");
    next(err);
  }
}

module.exports = {
  register,
  login,
  logout,
  googleLogin
};