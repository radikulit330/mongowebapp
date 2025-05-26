require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const connectDB = require("../config/database");

connectDB();

const seed = async () => {
  try {
    await User.updateOne(
      { username: "admin" },
      {
        $setOnInsert: {
          username: "admin",
          password: "password123",
          email: "admin@example.com", // Опціонально додаємо email
        },
      },
      { upsert: true }
    );
    console.log(
      'Користувача "admin" з паролем "password123" та email "admin@example.com" успішно створено/перевірено!'
    );

    mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error("Помилка створення/оновлення користувача:", err);
    mongoose.connection.close();
    process.exit(1);
  }
};
seed();
