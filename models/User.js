// models/User.js

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Додаємо ліміт пам'яті (в байтах). Наприклад, 50 MB.
const DEFAULT_STORAGE_LIMIT = 50 * 1024 * 1024;

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, "Будь ласка, введіть ім'я користувача"],
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, "Будь ласка, введіть пароль"],
    minlength: 6,
    select: false,
  },
  email: {
    // Додано поле email
    type: String,
    trim: true,
    lowercase: true,
    unique: true, // Має бути унікальним, якщо надано
    sparse: true, // Дозволяє мати багато документів без цього поля (або з null)
    match: [
      /\S+@\S+\.\S+/,
      "Будь ласка, введіть дійсну адресу електронної пошти",
    ], // Базова валідація формату
  },
  // --- ДОДАНО НОВЕ ПОЛЕ ---
  storageLimit: {
    type: Number,
    default: DEFAULT_STORAGE_LIMIT,
  },
  // -------------------------
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);
