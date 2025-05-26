// controllers/adminController.js
const User = require("../models/User");
const {
  formatBytes,
  getDisplayCollectionName,
  getPrefixedCollectionName,
  parsePrefixedName,
  getUserStorageUsage,
} = require("../utils/helpers");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose"); // Потрібен для роботи з mongoose.connection.db

const DEFAULT_STORAGE_LIMIT_MB = 50;

exports.showDashboard = (req, res) => {
  res.render("admin/dashboard", {
    title: "Адмін-панель - Головна",
    currentAdminPage: "dashboard",
  });
};

exports.listUsers = async (req, res, next) => {
  try {
    const users = await User.find({}).sort({ username: 1 }).lean();
    res.render("admin/users", {
      title: "Адмін-панель - Користувачі",
      currentAdminPage: "users",
      users: users.map((u) => ({
        ...u,
        storageLimitFormatted: formatBytes(u.storageLimit || 0),
        createdAtFormatted: u.createdAt
          ? new Date(u.createdAt).toLocaleDateString("uk-UA", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })
          : "N/A",
      })),
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    next(err);
  }
};

exports.showCreateUserForm = (req, res) => {
  res.render("admin/user_form", {
    title: "Адмін-панель - Створити користувача",
    currentAdminPage: "users",
    user: {},
    formAction: "/admin/users/create",
    isEdit: false,
    defaultStorageLimitMB: DEFAULT_STORAGE_LIMIT_MB,
  });
};

exports.createUser = async (req, res, next) => {
  const { username, password, email, storageLimitMB } = req.body;
  let errors = [];

  if (!username || username.trim() === "")
    errors.push("Ім'я користувача є обов'язковим.");
  if (!password || password.length < 6)
    errors.push("Пароль має бути не менше 6 символів.");
  if (email && email.trim() !== "" && !/\S+@\S+\.\S+/.test(email))
    errors.push("Неправильний формат email.");

  const storageLimitBytes =
    (parseInt(storageLimitMB, 10) || DEFAULT_STORAGE_LIMIT_MB) * 1024 * 1024;

  if (errors.length > 0) {
    return res.render("admin/user_form", {
      title: "Адмін-панель - Створити користувача",
      currentAdminPage: "users",
      user: { username, email, storageLimit: storageLimitBytes },
      formAction: "/admin/users/create",
      isEdit: false,
      error: errors.join(" "),
      defaultStorageLimitMB:
        parseInt(storageLimitMB, 10) || DEFAULT_STORAGE_LIMIT_MB,
    });
  }

  try {
    let existingUserQuery = [{ username: username.trim() }];
    if (email && email.trim() !== "") {
      existingUserQuery.push({ email: email.trim() });
    }
    const existingUser = await User.findOne({ $or: existingUserQuery });

    if (existingUser) {
      let message = "";
      if (existingUser.username === username.trim())
        message = `Користувач з іменем "${username.trim()}" вже існує.`;
      if (email && existingUser.email === email.trim())
        message +=
          (message ? " " : "") +
          `Email "${email.trim()}" вже використовується.`;
      return res.render("admin/user_form", {
        title: "Адмін-панель - Створити користувача",
        currentAdminPage: "users",
        user: { username, email, storageLimit: storageLimitBytes },
        formAction: "/admin/users/create",
        isEdit: false,
        error: message,
        defaultStorageLimitMB:
          parseInt(storageLimitMB, 10) || DEFAULT_STORAGE_LIMIT_MB,
      });
    }

    const newUser = new User({
      username: username.trim(),
      password,
      email: email && email.trim() !== "" ? email.trim() : undefined,
      storageLimit: storageLimitBytes,
    });
    await newUser.save();
    res.redirect(
      "/admin/users?success=" +
        encodeURIComponent(`Користувача "${username.trim()}" успішно створено.`)
    );
  } catch (err) {
    console.error("Admin Create User Error:", err);
    let errorMessage = "Помилка створення користувача.";
    if (err.errors) {
      errorMessage = Object.values(err.errors)
        .map((e) => e.message)
        .join(" ");
    } else if (err.code === 11000) {
      if (err.keyPattern.username)
        errorMessage = `Користувач з іменем "${username.trim()}" вже існує.`;
      if (err.keyPattern.email && email)
        errorMessage = `Email "${email.trim()}" вже використовується.`;
    }
    res.render("admin/user_form", {
      title: "Адмін-панель - Створити користувача",
      currentAdminPage: "users",
      user: { username, email, storageLimit: storageLimitBytes },
      formAction: "/admin/users/create",
      isEdit: false,
      error: errorMessage,
      defaultStorageLimitMB:
        parseInt(storageLimitMB, 10) || DEFAULT_STORAGE_LIMIT_MB,
    });
  }
};

exports.showEditUserForm = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) {
      return res.redirect(
        "/admin/users?error=" + encodeURIComponent("Користувача не знайдено.")
      );
    }
    res.render("admin/user_form", {
      title: `Адмін-панель - Редагувати: ${user.username}`,
      currentAdminPage: "users",
      user: user,
      formAction: `/admin/users/${user._id}/edit`,
      isEdit: true,
      defaultStorageLimitMB: Math.round(
        (user.storageLimit || 0) / (1024 * 1024)
      ),
    });
  } catch (err) {
    next(err);
  }
};

exports.updateUser = async (req, res, next) => {
  const { username, email, storageLimitMB, password } = req.body;
  const userId = req.params.id;
  let errors = [];

  const userToUpdate = await User.findById(userId);
  if (!userToUpdate) {
    return res.redirect(
      "/admin/users?error=" + encodeURIComponent("Користувача не знайдено.")
    );
  }

  if (!username || username.trim() === "")
    errors.push("Ім'я користувача є обов'язковим.");
  const trimmedEmail = email ? email.trim() : "";
  if (trimmedEmail && !/\S+@\S+\.\S+/.test(trimmedEmail))
    errors.push("Неправильний формат email.");
  const trimmedPassword = password ? password.trim() : "";
  if (trimmedPassword && trimmedPassword.length < 6)
    errors.push("Новий пароль має бути не менше 6 символів.");

  const currentStorageLimitMB = Math.round(
    (userToUpdate.storageLimit || 0) / (1024 * 1024)
  );
  const newStorageLimitMB =
    parseInt(storageLimitMB, 10) || currentStorageLimitMB;
  const storageLimitBytes = newStorageLimitMB * 1024 * 1024;

  if (errors.length > 0) {
    return res.render("admin/user_form", {
      title: `Адмін-панель - Редагувати: ${userToUpdate.username}`,
      currentAdminPage: "users",
      user: {
        _id: userId,
        username: username,
        email: email,
        storageLimit: userToUpdate.storageLimit,
      },
      formAction: `/admin/users/${userId}/edit`,
      isEdit: true,
      error: errors.join(" "),
      defaultStorageLimitMB: newStorageLimitMB,
    });
  }

  try {
    if (userToUpdate.username !== username.trim()) {
      const existingUser = await User.findOne({
        username: username.trim(),
        _id: { $ne: userId },
      });
      if (existingUser) {
        errors.push(`Ім'я користувача "${username.trim()}" вже зайняте.`);
      }
    }
    if (trimmedEmail && userToUpdate.email !== trimmedEmail) {
      const existingUser = await User.findOne({
        email: trimmedEmail,
        _id: { $ne: userId },
      });
      if (existingUser) {
        errors.push(`Email "${trimmedEmail}" вже використовується.`);
      }
    }

    if (errors.length > 0) {
      return res.render("admin/user_form", {
        title: `Адмін-панель - Редагувати: ${userToUpdate.username}`,
        currentAdminPage: "users",
        user: {
          _id: userId,
          username,
          email,
          storageLimit: userToUpdate.storageLimit,
        },
        formAction: `/admin/users/${userId}/edit`,
        isEdit: true,
        error: errors.join(" "),
        defaultStorageLimitMB: newStorageLimitMB,
      });
    }

    userToUpdate.username = username.trim();
    userToUpdate.email = trimmedEmail || undefined;
    userToUpdate.storageLimit = storageLimitBytes;

    if (trimmedPassword) {
      userToUpdate.password = trimmedPassword;
    }

    await userToUpdate.save();
    res.redirect(
      "/admin/users?success=" +
        encodeURIComponent(
          `Дані користувача "${userToUpdate.username}" успішно оновлено.`
        )
    );
  } catch (err) {
    console.error("Admin Update User Error:", err);
    const titleUsername = userToUpdate ? userToUpdate.username : "Користувач";
    let errorMessage = "Помилка оновлення користувача.";
    if (err.errors) {
      errorMessage = Object.values(err.errors)
        .map((e) => e.message)
        .join(" ");
    } else if (err.code === 11000) {
      if (err.keyPattern.username)
        errorMessage = `Ім'я користувача "${username.trim()}" вже зайняте.`;
      if (err.keyPattern.email)
        errorMessage = `Email "${trimmedEmail}" вже використовується.`;
    }

    res.render("admin/user_form", {
      title: `Адмін-панель - Редагувати: ${titleUsername}`,
      currentAdminPage: "users",
      user: {
        _id: userId,
        username,
        email,
        storageLimit: userToUpdate.storageLimit,
      },
      formAction: `/admin/users/${userId}/edit`,
      isEdit: true,
      error: errorMessage,
      defaultStorageLimitMB: newStorageLimitMB,
    });
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.redirect(
        "/admin/users?error=" + encodeURIComponent("Користувача не знайдено.")
      );
    }
    if (user.username === "admin") {
      return res.redirect(
        "/admin/users?error=" +
          encodeURIComponent("Неможливо видалити головного адміністратора.")
      );
    }
    await User.deleteOne({ _id: req.params.id });
    res.redirect(
      "/admin/users?success=" +
        encodeURIComponent(`Користувача "${user.username}" успішно видалено.`)
    );
  } catch (err) {
    console.error("Admin Delete User Error:", err);
    next(err);
  }
};

// НОВА ФУНКЦІЯ: Перегляд колекцій конкретного користувача
exports.listUserCollections = async (req, res, next) => {
  const { userId } = req.params;
  try {
    const targetUser = await User.findById(userId).lean();
    if (!targetUser) {
      return res.redirect(
        "/admin/users?error=" + encodeURIComponent("Користувача не знайдено.")
      );
    }

    const allCollectionsRaw = await mongoose.connection.db
      .listCollections()
      .toArray();
    const userSpecificCollections = [];

    for (const coll of allCollectionsRaw) {
      if (coll.name.startsWith(targetUser._id.toString() + "_")) {
        const displayName = getDisplayCollectionName(
          coll.name,
          targetUser._id.toString()
        );
        if (displayName) {
          let collectionStats = { count: 0, size: 0, storageSize: 0 };
          try {
            const stats = await mongoose.connection.db
              .collection(coll.name)
              .stats();
            collectionStats = {
              count: stats.count || 0,
              size: stats.size || 0,
              storageSize: stats.storageSize || 0,
            };
          } catch (statErr) {
            console.error(
              `Admin: Не вдалося отримати статистику для ${coll.name}:`,
              statErr
            );
          }
          userSpecificCollections.push({
            actualName: coll.name,
            displayName: displayName,
            count: collectionStats.count,
            sizeFormatted: formatBytes(collectionStats.size),
            storageSizeFormatted: formatBytes(collectionStats.storageSize),
          });
        }
      }
    }

    const usage = await getUserStorageUsage(targetUser._id.toString());
    const storageUsed = usage.storageSize;
    const dataUsed = usage.dataSize;
    let storageInfoForUser = null;

    if (storageUsed >= 0 && dataUsed >= 0) {
      const storageLimit =
        targetUser.storageLimit || DEFAULT_STORAGE_LIMIT_MB * 1024 * 1024;
      const percentage =
        storageLimit > 0
          ? Math.min(Math.round((storageUsed / storageLimit) * 100), 100)
          : 0;
      storageInfoForUser = {
        used: storageUsed,
        data: dataUsed,
        limit: storageLimit,
        usedFormatted: formatBytes(storageUsed),
        dataFormatted: formatBytes(dataUsed),
        limitFormatted: formatBytes(storageLimit),
        percentage: percentage,
        isOverLimit: storageLimit > 0 ? storageUsed >= storageLimit : false,
      };
    }

    res.render("admin/user_collections", {
      title: `Адмін-панель - Колекції: ${targetUser.username}`,
      currentAdminPage: "users",
      targetUser: targetUser,
      collections: userSpecificCollections,
      storageInfo: storageInfoForUser,
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    next(err);
  }
};
