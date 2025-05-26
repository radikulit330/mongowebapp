const express = require("express");
const router = express.Router();
const { performSearch } = require("../controllers/searchController");
// Middleware requireLogin буде застосовано в app.js до цього роутера

// Виконання пошуку
router.get("/search", performSearch);

module.exports = router;
