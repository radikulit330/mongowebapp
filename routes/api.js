const express = require("express");
const router = express.Router();
const apiController = require("../controllers/apiController");
// requireLogin буде застосовано в app.js

// Маршрут для отримання даних колекції користувача
// Наприклад: GET /api/data?target=someuser:myCollection
router.get("/data", apiController.getUserCollectionData);

module.exports = router;
