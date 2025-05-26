const mongoose = require("mongoose");
const User = require("../models/User"); // Модель користувача
const { getPrefixedCollectionName } = require("../utils/helpers"); // Наш хелпер

exports.getUserCollectionData = async (req, res, next) => {
  const { target } = req.query;

  if (!target || typeof target !== "string" || !target.includes(":")) {
    return res.status(400).json({
      success: false,
      message:
        'Неправильний формат запиту. Очікується параметр "target" у форматі "username:collectionName".',
    });
  }

  const [targetUsername, collectionDisplayName] = target.split(":", 2);

  if (!targetUsername || !collectionDisplayName) {
    return res.status(400).json({
      success: false,
      message: "Ім'я користувача або назва колекції не можуть бути порожніми.",
    });
  }

  try {
    const targetUser = await User.findOne({ username: targetUsername });
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: `Користувача "${targetUsername}" не знайдено.`,
      });
    }

    if (
      !req.session.isAdmin &&
      req.session.userId !== targetUser._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Доступ заборонено: ви не можете переглядати дані іншого користувача.",
      });
    }

    let actualCollectionName;

    // --- ОНОВЛЕНА ЛОГІКА ТУТ ---
    if (targetUser.username === "admin") {
      // Якщо цільовий користувач - admin, вважаємо, що назва колекції глобальна (без префікса)
      actualCollectionName = collectionDisplayName;
    } else {
      // Для інших користувачів використовуємо префікс
      actualCollectionName = getPrefixedCollectionName(
        targetUser._id.toString(),
        collectionDisplayName
      );
    }
    // -------------------------

    const collection = mongoose.connection.db.collection(actualCollectionName);
    const collections = await mongoose.connection.db
      .listCollections({ name: actualCollectionName })
      .toArray();

    if (collections.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Колекцію "${actualCollectionName}" не знайдено.`, // Показуємо реальну назву, яку шукали
      });
    }

    const documents = await collection.find({}).toArray();

    res.status(200).json({
      success: true,
      username: targetUsername,
      collection: collectionDisplayName,
      actual_name: actualCollectionName, // Додано для ясності
      count: documents.length,
      data: documents,
    });
  } catch (err) {
    console.error(`API Get Collection Data Error for target "${target}":`, err);
    err.isApiRequest = true;
    next(err);
  }
};
