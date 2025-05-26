// routes/tools.js
const express = require("express");
const router = express.Router();

// Маршрут для відображення сторінки тестувальника API
// Передбачається, що requireLogin буде застосовано до цього роутера в app.js
router.get("/api-tester", (req, res) => {
  // Отримуємо ім'я користувача з сесії для прикладу URL
  const usernameForExample = req.session.username || "admin";
  const exampleCollection =
    usernameForExample === "admin" ? "users" : "myNotes"; // Приклад назви колекції

  res.render("api_tester", {
    title: "API Тестувальник", // Для <title> в header.ejs
    defaultApiUrl: `/api/data?target=${usernameForExample}:${exampleCollection}`,
  });
});

module.exports = router;
