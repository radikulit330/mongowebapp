// controllers/authController.js
const User = require("../models/User");
const https = require("https"); // Для запиту до Google
const querystring = require("querystring"); // Для формування тіла запиту

exports.showLogin = (req, res) => {
  if (req.session.userId) {
    return res.redirect("/");
  }
  res.render("login", {
    error: req.query.error || null, // Показуємо помилку, якщо вона передана через query
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY, // Передаємо ключ сайту
  });
};

exports.doLogin = async (req, res) => {
  const { username, password } = req.body;
  const recaptchaToken = req.body["g-recaptcha-response"];

  if (!process.env.RECAPTCHA_SITE_KEY || !process.env.RECAPTCHA_SECRET_KEY) {
    console.error("ПОМИЛКА: Ключі reCAPTCHA не налаштовані в .env файлі!");
    return res.status(500).render("login", {
      error: "Сервер reCAPTCHA не налаштований належним чином.",
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
    });
  }

  if (!recaptchaToken) {
    return res.status(400).render("login", {
      error: "Будь ласка, пройдіть перевірку reCAPTCHA.",
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
    });
  }

  try {
    const isRecaptchaValid = await verifyRecaptcha(recaptchaToken, req.ip);
    if (!isRecaptchaValid) {
      return res.status(400).render("login", {
        error: "Недійсна reCAPTCHA. Спробуйте ще раз.",
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
      });
    }

    if (!username || !password) {
      return res.status(400).render("login", {
        error: "Будь ласка, введіть ім'я користувача та пароль",
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
      });
    }

    const user = await User.findOne({ username }).select("+password");
    if (!user) {
      return res.status(401).render("login", {
        error: "Неправильне ім'я користувача або пароль",
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
      });
    }
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).render("login", {
        error: "Неправильне ім'я користувача або пароль",
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
      });
    }

    req.session.userId = user._id.toString();
    req.session.username = user.username;
    req.session.isAdmin = user.username === "admin";

    res.redirect("/");
  } catch (err) {
    console.error("Login Error (reCAPTCHA or User Login):", err);
    res.status(500).render("login", {
      error: "Сталася помилка на сервері. Спробуйте пізніше.",
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
    });
  }
};

async function verifyRecaptcha(token, remoteIp) {
  return new Promise((resolve, reject) => {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      // Додаткова перевірка
      console.error("ПОМИЛКА: RECAPTCHA_SECRET_KEY не знайдено!");
      return reject(
        new Error("Секретний ключ reCAPTCHA не налаштовано на сервері.")
      );
    }
    const verificationURL = "https://www.google.com/recaptcha/api/siteverify";

    const postData = querystring.stringify({
      secret: secretKey,
      response: token,
      remoteip: remoteIp,
    });

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(verificationURL, options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => {
        responseData += chunk;
      });
      res.on("end", () => {
        try {
          const result = JSON.parse(responseData);
          if (result.success) {
            resolve(true);
          } else {
            console.warn(
              "reCAPTCHA verification failed:",
              result["error-codes"]
            );
            resolve(false);
          }
        } catch (e) {
          console.error("Error parsing reCAPTCHA response:", e);
          reject(e); // Помилка парсингу JSON
        }
      });
    });

    req.on("error", (error) => {
      console.error("Error during reCAPTCHA request:", error);
      reject(error); // Мережева помилка або інша помилка запиту
    });

    req.write(postData);
    req.end();
  });
}

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
