// --- ЗАВАНТАЖЕННЯ ЗМІННИХ СЕРЕДОВИЩА ---
require("dotenv").config();

// --- ІМПОРТ ОСНОВНИХ МОДУЛІВ ---
const express = require("express");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const mongoose = require("mongoose");
const connectDB = require("./config/database");
const { launchBot } = require("./bot");

// --- ІМПОРТ МАРШРУТІВ ---
const indexRoutes = require("./routes/index");
const databaseRoutes = require("./routes/database");
const authRoutes = require("./routes/auth");
const settingsRoutes = require("./routes/settings");
const searchRoutes = require("./routes/search");
const apiRoutes = require("./routes/api");
const toolsRoutes = require("./routes/tools");

// --- ІМПОРТ MIDDLEWARE ---
const { requireLogin } = require("./middleware/auth");

// --- ІНІЦІАЛІЗАЦІЯ ---
connectDB();
const app = express();

// --- НАЛАШТУВАННЯ ШАБЛОНІЗАТОРА EJS ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// --- MIDDLEWARE (ПРОМІЖНЕ ПЗ) ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.use((req, res, next) => {
  res.locals.isLoggedIn = !!req.session.userId;
  res.locals.username = req.session.username || null;
  res.locals.isAdmin = req.session.isAdmin || false;
  res.locals.currentContext = "collections";
  res.locals.searchTerm = req.query.q || "";
  res.locals.queryString = req.url.includes("?")
    ? req.url.substring(req.url.indexOf("?"))
    : "";
  // res.locals.csrfToken = req.csrfToken(); // Для майбутнього CSRF захисту
  next();
});

// --- МАРШРУТИ (ROUTES) ---
app.use("/", authRoutes);

app.use("/api", requireLogin, apiRoutes);
app.use("/tools", requireLogin, toolsRoutes);
app.use("/settings", requireLogin, settingsRoutes);
app.use("/search", requireLogin, searchRoutes);
app.use("/db", requireLogin, databaseRoutes);
app.use("/", requireLogin, indexRoutes);

// --- ОБРОБКА ПОМИЛОК ---

// Обробка 404 - Сторінку не знайдено
app.use((req, res, next) => {
  res.status(404).render("error", {
    title: "Сторінку не знайдено (404)", // <--- ДОДАНО/ОНОВЛЕНО TITLE
    message: "Помилка 404: Сторінку не знайдено.",
    error: { status: 404, stack: `URL ${req.originalUrl} не існує.` },
  });
});

// Глобальний обробник помилок (500)
app.use((err, req, res, next) => {
  console.error("ГЛОБАЛЬНА ПОМИЛКА:", err.stack);
  const statusCode = err.status || 500;
  const errMessage = err.message || "Внутрішня помилка сервера.";

  if (
    err.isApiRequest ||
    req.xhr ||
    (req.headers.accept && req.headers.accept.includes("json"))
  ) {
    return res.status(statusCode).json({
      success: false,
      message: errMessage,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  }

  res.status(statusCode).render("error", {
    title: `Помилка ${statusCode}`, // <--- ДОДАНО/ОНОВЛЕНО TITLE
    message: errMessage,
    error: process.env.NODE_ENV === "development" ? err : {},
  });
});

// --- ЗАПУСК СЕРВЕРА ТА БОТА ---
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Сервер успішно запущено на порті ${PORT}`);
  console.log(`Режим: ${process.env.NODE_ENV || "development"}`);
});

mongoose.connection.once("open", () => {
  console.log("З'єднання з БД встановлено, запускаємо бота...");
  launchBot();
});

process.on("SIGINT", () => {
  console.log("Отримано SIGINT. Закриваємо з'єднання...");
  mongoose.connection
    .close(false)
    .then(() => {
      console.log("MongoDB з'єднання закрито.");
      server.close(() => {
        console.log("HTTP сервер закрито.");
        process.exit(0);
      });
    })
    .catch((err) => {
      console.error("Помилка закриття MongoDB з'єднання:", err);
      server.close(() => {
        console.log("HTTP сервер закрито (з помилкою MongoDB).");
        process.exit(1);
      });
    });
});
