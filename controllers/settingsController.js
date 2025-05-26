const User = require("../models/User"); // Переконайтесь, що шлях до моделі правильний

// Відобразити сторінку налаштувань
exports.showSettings = (req, res) => {
  // Передаємо ім'я користувача з сесії та можливі повідомлення з query параметрів
  res.render("settings", {
    username: req.session.username,
    success: req.query.success, // Для повідомлень про успіх
    error: req.query.error, // Для повідомлень про помилки
  });
};

// Змінити пароль
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const userId = req.session.userId;

  // 1. Валідація вхідних даних
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.redirect("/settings?error=Будь ласка, заповніть всі поля.");
  }
  if (newPassword !== confirmPassword) {
    return res.redirect("/settings?error=Нові паролі не співпадають.");
  }
  if (newPassword.length < 6) {
    return res.redirect(
      "/settings?error=Новий пароль має бути не менше 6 символів."
    );
  }

  try {
    // 2. Знаходимо користувача (з паролем)
    const user = await User.findById(userId).select("+password");
    if (!user) {
      // Малоймовірно, якщо користувач залогінений, але для повноти
      return res.redirect("/settings?error=Користувача не знайдено.");
    }

    // 3. Перевіряємо поточний пароль
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.redirect("/settings?error=Неправильний поточний пароль.");
    }

    // 4. Оновлюємо та зберігаємо новий пароль
    // Mongoose pre-save hook в моделі User автоматично захешує новий пароль
    user.password = newPassword;
    await user.save();

    // 5. Перенаправляємо з повідомленням про успіх
    return res.redirect("/settings?success=Пароль успішно змінено.");
  } catch (err) {
    console.error("Change Password Error:", err);
    // Замінюємо лапки, щоб уникнути проблем з URL, якщо помилка містить їх
    const errorMessage = (err.message || "Невідома помилка сервера.").replace(
      /"/g,
      "'"
    );
    return res.redirect(
      `/settings?error=Помилка зміни пароля: ${encodeURIComponent(
        errorMessage
      )}`
    );
  }
};
