/**
 * Middleware для перевірки, чи користувач автентифікований.
 * Якщо користувач залогінений (має сесію з userId), передає управління далі.
 * Якщо ні, перенаправляє на сторінку входу (/login).
 * @param {object} req - Об'єкт запиту Express.
 * @param {object} res - Об'єкт відповіді Express.
 * @param {function} next - Функція для передачі управління наступному middleware.
 */
exports.requireLogin = (req, res, next) => {
  // Перевіряємо наявність сесії та userId в ній
  if (req.session && req.session.userId) {
    return next(); // Користувач залогінений, все гаразд, йдемо далі
  } else {
    // Користувач не залогінений, перенаправляємо на сторінку входу
    return res.redirect("/login");
  }
};

// Тут можна додати інші middleware, наприклад, для перевірки ролей (адмін)
