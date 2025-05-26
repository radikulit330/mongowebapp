const mongoose = require("mongoose");

/**
 * Асинхронна функція для підключення до бази даних MongoDB.
 * Використовує MONGO_URI зі змінних середовища.
 * У разі помилки виводить повідомлення та завершує процес.
 */
const connectDB = async () => {
  try {
    // Намагаємось підключитись до MongoDB
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Опції для уникнення попереджень (можуть змінюватись з версіями Mongoose)
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // Якщо Mongoose >= 6, ці опції більше не потрібні,
      // але їх наявність зазвичай не шкодить.
    });

    // Виводимо повідомлення про успішне підключення
    console.log(`MongoDB Підключено: ${conn.connection.host}`);
  } catch (err) {
    // Виводимо повідомлення про помилку та завершуємо роботу сервера
    console.error(`Помилка підключення до MongoDB: ${err.message}`);
    process.exit(1); // Завершуємо процес з кодом помилки
  }
};

// Експортуємо функцію для використання в app.js
module.exports = connectDB;
