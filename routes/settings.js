const express = require("express");
const router = express.Router();
const {
  showSettings,
  changePassword,
} = require("../controllers/settingsController");
// Middleware requireLogin вже застосовано в app.js до всього цього роутера,
// тому немає потреби додавати його до кожного маршруту окремо тут.

// Маршрут для відображення сторінки налаштувань
// Тепер доступний за GET /settings (оскільки префікс /settings задано в app.js)
router.get("/", showSettings);

// Маршрут для обробки зміни пароля
// Тепер доступний за POST /settings/change-password
router.post("/change-password", changePassword);

module.exports = router;
