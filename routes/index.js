const express = require("express");
const router = express.Router();
const databaseController = require("../controllers/databaseController");
// Middleware requireLogin буде застосовано в app.js до цього роутера

// Головна сторінка - відображає список колекцій
router.get("/", databaseController.listCollections);

// Маршрут для відображення форми створення колекції
router.get("/create-collection", databaseController.showCreateCollectionForm);

// Маршрут для обробки створення колекції
router.post("/create-collection", databaseController.createCollection);

module.exports = router;
