// middleware/admin.js
exports.requireAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    return next(); // Користувач є адміном, все гаразд
  } else if (req.session && req.session.userId) {
    // Користувач залогінений, але не адмін
    return res.status(403).render("error", {
      title: "Доступ заборонено (403)",
      message: "Помилка 403: У вас немає прав доступу до цієї сторінки.",
      error: {
        status: 403,
        stack: "Спроба доступу до адмін-ресурсу неадміністратором.",
      },
    });
  } else {
    // Користувач не залогінений
    return res.redirect("/login");
  }
};
