const express = require("express");
const router = express.Router();
const databaseController = require("../controllers/databaseController");
// Middleware requireLogin буде застосовано в app.js до цього роутера

// --- Колекції ---
// Видалення колекції (AJAX) - Має йти ПЕРЕД /:name
router.delete("/:name", databaseController.deleteCollectionAjax);

// --- Документи ---
// Відображення колекції та її документів
router.get("/:name", databaseController.viewCollection);
// Відображення форми додавання документа
router.get("/:name/add", databaseController.showAddForm);
// Додавання документа
router.post("/:name/add", databaseController.addDocument);
// Відображення форми редагування документа
router.get("/:name/:id/edit", databaseController.showEditForm);
// Оновлення документа
router.post("/:name/:id/edit", databaseController.updateDocument);
// Видалення документа (AJAX)
router.delete("/:name/:id", databaseController.deleteDocumentAjax);

// --- Індекси ---
// Створення індексу
router.post("/:name/index", databaseController.createIndex);
// Видалення індексу
router.delete("/:name/index/:indexName", databaseController.deleteIndex);

// --- Експорт ---
// Експорт JSON
router.get("/:name/export/json", databaseController.exportJson);
// Експорт CSV
router.get("/:name/export/csv", databaseController.exportCsv);

module.exports = router;
