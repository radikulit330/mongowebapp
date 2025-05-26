const express = require("express");
const router = express.Router();
const {
  showLogin,
  doLogin,
  doLogout,
} = require("../controllers/authController");

// Відображення сторінки входу
router.get("/login", showLogin);

// Обробка даних форми входу
router.post("/login", doLogin);

// Вихід з системи
router.get("/logout", doLogout);

module.exports = router;
