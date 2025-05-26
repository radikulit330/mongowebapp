require("dotenv").config({ path: "../.env" }); // Вказуємо шлях до .env
const mongoose = require("mongoose");
const User = require("../models/User"); // Вказуємо шлях до моделі
const connectDB = require("../config/database"); // Вказуємо шлях до конфігу БД

connectDB();

const seed = async () => {
  try {
    // Видаляємо існуючого 'admin', щоб уникнути дублікатів
    await User.deleteOne({ username: "admin" });
    console.log("Існуючий 'admin' видалений (якщо був)...");

    // Створюємо нового 'admin'
    await User.create({
      username: "admin",
      password: "password123", // Пароль буде хешований автоматично моделлю
    });

    console.log(
      'Користувача "admin" з паролем "password123" успішно створено/оновлено!'
    );
    mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error("Помилка створення користувача:", err);
    mongoose.connection.close();
    process.exit(1);
  }
};

seed();
