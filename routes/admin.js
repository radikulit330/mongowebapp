// routes/admin.js
const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");

// Головна сторінка адмін-панелі
router.get("/", adminController.showDashboard);

// Користувачі
router.get("/users", adminController.listUsers);
router.get("/users/create", adminController.showCreateUserForm);
router.post("/users/create", adminController.createUser);
router.get("/users/:id/edit", adminController.showEditUserForm);
router.post("/users/:id/edit", adminController.updateUser);
router.post("/users/:id/delete", adminController.deleteUser);

// НОВИЙ МАРШРУТ: Перегляд колекцій конкретного користувача
router.get("/users/:userId/collections", adminController.listUserCollections);

// Маршрути для видалення колекції користувача з адмін-панелі (якщо потрібно)
// router.post("/users/:userId/collections/:collectionDisplayName/delete", adminController.deleteUserCollection);

// Майбутні маршрути для адмін-панелі:
// router.get("/stats", adminController.showAppStats); // Для загальної статистики
// router.get("/collections", adminController.listAllCollections); // Для перегляду всіх колекцій
// router.get("/app-settings", adminController.showAppSettings); // Для налаштувань додатку

module.exports = router;
