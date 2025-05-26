const User = require("../models/User");

exports.showLogin = (req, res) => {
  if (req.session.userId) {
    return res.redirect("/");
  }
  res.render("login", { error: null });
};

exports.doLogin = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .render("login", {
        error: "Будь ласка, введіть ім'я користувача та пароль",
      });
  }

  try {
    const user = await User.findOne({ username }).select("+password");
    if (!user) {
      return res
        .status(401)
        .render("login", { error: "Неправильне ім'я користувача або пароль" });
    }
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .render("login", { error: "Неправильне ім'я користувача або пароль" });
    }

    req.session.userId = user._id.toString();
    req.session.username = user.username;
    req.session.isAdmin = user.username === "admin"; // <--- ВСТАНОВЛЮЄМО ПРАВА АДМІНА

    res.redirect("/");
  } catch (err) {
    console.error("Login Error:", err);
    res
      .status(500)
      .render("login", {
        error: "Сталася помилка на сервері. Спробуйте пізніше.",
      });
  }
};

exports.doLogout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout Error:", err);
      return res.redirect("/");
    }
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
};
