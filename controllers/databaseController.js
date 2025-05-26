// controllers/databaseController.js

const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const { Parser } = require("json2csv");
const {
  formatBytes,
  detectMongoType,
  convertToType,
  buildQuery,
  getPrefixedCollectionName,
  getDisplayCollectionName,
  parsePrefixedName,
  getUserStorageUsage,
} = require("../utils/helpers");
const User = require("../models/User"); // Потрібен для отримання username цільового користувача

// Оновлюємо getActualCollectionNameAndVerify
const getActualCollectionNameAndVerify = (req, displayNameFromUrl) => {
  let actualCollectionName;
  const targetUserIdByAdmin = req.query.targetUser; // Отримуємо ID користувача, якщо адмін переглядає його колекцію

  if (!displayNameFromUrl || typeof displayNameFromUrl !== "string") {
    const err = new Error("Неправильна або відсутня назва колекції.");
    err.status = 400;
    throw err;
  }

  if (req.session.isAdmin) {
    if (
      targetUserIdByAdmin &&
      mongoose.Types.ObjectId.isValid(targetUserIdByAdmin)
    ) {
      // Адмін вказав конкретного користувача через параметр targetUser
      actualCollectionName = getPrefixedCollectionName(
        targetUserIdByAdmin,
        displayNameFromUrl
      );
    } else {
      // Адмін переглядає глобальну колекцію, свою власну (якщо така є і не префіксована),
      // або якщо targetUser не передано/невалідний - це звичайна навігація адміна.
      // У цьому випадку displayNameFromUrl *є* actualCollectionName.
      actualCollectionName = displayNameFromUrl;
    }
  } else {
    // Звичайний користувач
    actualCollectionName = getPrefixedCollectionName(
      req.session.userId,
      displayNameFromUrl
    );
    // Для звичайного користувача, ми повинні перевірити, чи він намагається отримати доступ до своєї колекції
    if (!actualCollectionName.startsWith(req.session.userId + "_")) {
      const err = new Error(
        "Доступ заборонено: спроба доступу до чужої колекції."
      );
      err.status = 403;
      throw err;
    }
  }
  return actualCollectionName;
};

exports.listCollections = async (req, res, next) => {
  try {
    const allCollectionsRaw = await mongoose.connection.db
      .listCollections()
      .toArray();
    let userVisibleCollections = [];
    let storageInfo = null;

    if (req.session.isAdmin) {
      userVisibleCollections = allCollectionsRaw.map((coll) => {
        const { ownerId, displayName } = parsePrefixedName(coll.name);
        return {
          name: coll.name,
          displayNameForCard: ownerId
            ? `${displayName} (ID: ${ownerId.substring(0, 6)}...)`
            : `${displayName} (Глобальна)`,
          ownerId: ownerId,
        };
      });
    } else {
      const userId = req.session.userId;
      userVisibleCollections = allCollectionsRaw
        .map((coll) => {
          const displayName = getDisplayCollectionName(
            coll.name,
            req.session.userId
          );
          return displayName
            ? {
                name: displayName,
                displayNameForCard: displayName,
                isOwned: true,
              }
            : null;
        })
        .filter((coll) => coll !== null);

      const user = await User.findById(userId).lean();
      const usage = await getUserStorageUsage(userId);
      const storageUsed = usage.storageSize;
      const dataUsed = usage.dataSize;

      if (!user) {
        console.error(`[ERROR] Не знайдено користувача з ID: ${userId}`);
        // Важливо не просто логувати, а обробити помилку,
        // наприклад, перенаправити на логін або показати сторінку помилки
        return next(
          new Error("Користувача не знайдено, сесія може бути недійсною.")
        );
      }

      console.log("[DEBUG] User object:", user);
      console.log("[DEBUG] Storage Used:", storageUsed, "Data Used:", dataUsed);

      if (storageUsed >= 0 && dataUsed >= 0) {
        const DEFAULT_STORAGE_LIMIT = 50 * 1024 * 1024;
        const storageLimit = user.storageLimit || DEFAULT_STORAGE_LIMIT;
        console.log("[DEBUG] Storage Limit:", storageLimit);
        const percentage =
          storageLimit > 0
            ? Math.min(Math.round((storageUsed / storageLimit) * 100), 100)
            : 0;
        storageInfo = {
          used: storageUsed,
          data: dataUsed,
          limit: storageLimit,
          usedFormatted: formatBytes(storageUsed),
          dataFormatted: formatBytes(dataUsed),
          limitFormatted: formatBytes(storageLimit),
          percentage: percentage,
          isOverLimit: storageLimit > 0 ? storageUsed >= storageLimit : false,
        };
        console.log("[DEBUG] storageInfo object:", storageInfo);
      } else {
        console.log("[DEBUG] Не вдалося отримати storageUsed або dataUsed.");
      }
    }
    res.locals.currentContext = "collections"; // Встановлюємо контекст для пошуку
    res.render("index", {
      collections: userVisibleCollections,
      storageInfo: storageInfo,
    });
  } catch (err) {
    console.error("List Collections Error:", err);
    next(err);
  }
};

exports.showCreateCollectionForm = (req, res) => {
  res.render("create_collection", {
    isUserAdmin: req.session.isAdmin,
    error: req.query.error,
    message: req.query.message,
  });
};

exports.createCollection = async (req, res, next) => {
  let collectionNameFromUser = req.body.collectionName;
  let actualCollectionNameToCreate;
  try {
    if (!req.session.isAdmin) {
      const userId = req.session.userId;
      const user = await User.findById(userId).lean(); // Отримуємо користувача

      if (!user) {
        // Перевірка чи користувач існує
        return res.redirect(
          `/?error=${encodeURIComponent("Помилка: користувача не знайдено.")}`
        );
      }

      const usage = await getUserStorageUsage(userId);
      const storageUsed = usage.storageSize;

      const DEFAULT_STORAGE_LIMIT = 50 * 1024 * 1024; // Це має бути узгоджено з моделлю
      const storageLimit = user.storageLimit || DEFAULT_STORAGE_LIMIT;

      if (storageUsed >= 0 && storageUsed >= storageLimit && storageLimit > 0) {
        return res.redirect(
          `/?error=${encodeURIComponent(
            "Ліміт сховища перевищено. Ви не можете створювати нові колекції."
          )}`
        );
      }
    }

    if (!collectionNameFromUser || collectionNameFromUser.trim() === "") {
      return res.redirect(
        `/create-collection?error=${encodeURIComponent(
          "Назва колекції не може бути порожньою."
        )}`
      );
    }
    collectionNameFromUser = collectionNameFromUser.trim();
    if (
      collectionNameFromUser.includes(" ") ||
      collectionNameFromUser.startsWith("system.")
    ) {
      return res.redirect(
        `/create-collection?error=${encodeURIComponent(
          'Назва колекції містить недопустимі символи або починається з "system.".'
        )}`
      );
    }

    const potentialOwner = parsePrefixedName(collectionNameFromUser);
    if (
      req.session.isAdmin &&
      potentialOwner.ownerId &&
      mongoose.Types.ObjectId.isValid(potentialOwner.ownerId)
    ) {
      actualCollectionNameToCreate = collectionNameFromUser;
    } else if (req.session.isAdmin) {
      actualCollectionNameToCreate = collectionNameFromUser;
    } else {
      actualCollectionNameToCreate = getPrefixedCollectionName(
        req.session.userId,
        collectionNameFromUser
      );
    }
    await mongoose.connection.db.createCollection(actualCollectionNameToCreate);
    res.redirect(
      `/?message=${encodeURIComponent(
        `Колекцію '${collectionNameFromUser}' (actual: ${actualCollectionNameToCreate}) успішно створено!`
      )}`
    );
  } catch (err) {
    console.error("Create Collection Error:", err);
    res.redirect(
      `/create-collection?error=${encodeURIComponent(
        `Помилка створення: ${err.message}`
      )}`
    );
  }
};

exports.viewCollection = async (req, res, next) => {
  const displayNameFromUrl = req.params.name;
  let actualCollectionName;
  let ownerUsernameForDisplay = req.session.username;
  let targetUserIdForAdminLinks = null;

  try {
    if (
      req.session.isAdmin &&
      req.query.targetUser &&
      mongoose.Types.ObjectId.isValid(req.query.targetUser)
    ) {
      const targetUser = await User.findById(req.query.targetUser).lean();
      if (targetUser) {
        ownerUsernameForDisplay = targetUser.username;
        targetUserIdForAdminLinks = req.query.targetUser;
      }
    }

    actualCollectionName = getActualCollectionNameAndVerify(
      req,
      displayNameFromUrl
    );

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const collection = mongoose.connection.db.collection(actualCollectionName);

    let stats = null;
    try {
      const rawStats = await collection.stats();
      stats = {
        count: rawStats.count,
        avgObjSize: formatBytes(rawStats.avgObjSize || 0),
        size: formatBytes(rawStats.size || 0),
        storageSize: formatBytes(rawStats.storageSize || 0),
        nindexes: rawStats.nindexes,
        totalIndexSize: formatBytes(rawStats.totalIndexSize || 0),
      };
    } catch (statErr) {
      console.error(`Stats Error for ${actualCollectionName}:`, statErr);
      stats = { error: "Не вдалося отримати статистику." };
    }

    let indexes = [];
    try {
      indexes = await collection.listIndexes().toArray();
    } catch (indexErr) {
      console.error(`Indexes Error for ${actualCollectionName}:`, indexErr);
      indexes = [
        { name: "Error", key: { error: "Не вдалося отримати індекси." } },
      ];
    }

    const query = buildQuery(req.query);
    let documents = [];
    let totalDocuments = 0;
    let searchMessage = null;
    let tableHeaders = ["_id"];

    try {
      totalDocuments = await collection.countDocuments(query);
      documents = await collection
        .find(query)
        .skip(skip)
        .limit(limit)
        .toArray();

      const allKeys = new Set();
      documents.forEach((doc) => {
        Object.keys(doc).forEach((key) => allKeys.add(key));
      });
      tableHeaders = ["_id"].concat(
        Array.from(allKeys)
          .filter((key) => key !== "_id")
          .sort()
      );

      if (req.query.q)
        searchMessage = `Знайдено ${totalDocuments} результатів для "${req.query.q}" у "${displayNameFromUrl}".`;
      if (req.query.field)
        searchMessage = `Знайдено ${totalDocuments} результатів за фільтром у "${displayNameFromUrl}".`;
    } catch (err) {
      if (
        (err.codeName === "IndexNotFound" ||
          (err.message && err.message.includes("text index required"))) &&
        req.query.q
      ) {
        searchMessage = `Для повнотекстового пошуку потрібен текстовий індекс.`;
        documents = [];
        totalDocuments = 0;
      } else {
        throw err;
      }
    }

    const sampleDocsForFields = await collection
      .find(query)
      .limit(100)
      .toArray();
    const fieldSet = new Set(["_id"]);
    sampleDocsForFields.forEach((doc) =>
      Object.keys(doc).forEach((key) => fieldSet.add(key))
    );
    const fieldsForFilter = Array.from(fieldSet).sort();

    res.locals.currentContext = displayNameFromUrl;

    let currentQueryString = req.url.includes("?")
      ? req.url.substring(req.url.indexOf("?"))
      : "";
    if (
      targetUserIdForAdminLinks &&
      !new URLSearchParams(currentQueryString).has("targetUser")
    ) {
      // Перевіряємо чи вже є
      currentQueryString = currentQueryString
        ? `${currentQueryString}&targetUser=${targetUserIdForAdminLinks}`
        : `?targetUser=${targetUserIdForAdminLinks}`;
    }
    res.locals.queryString = currentQueryString;

    res.render("collection", {
      collectionName: displayNameFromUrl,
      ownerUsername: ownerUsernameForDisplay,
      targetUserIdForAdminView: targetUserIdForAdminLinks,
      documents: documents,
      fields: fieldsForFilter,
      tableHeaders: tableHeaders,
      currentPage: page,
      totalPages: Math.ceil(totalDocuments / limit),
      limit: limit,
      searchMessage: searchMessage,
      stats: stats,
      indexes: indexes,
      currentField: req.query.field || "",
      currentValue: req.query.value || "",
      helpers: {
        detectMongoType,
        formatBytes,
      },
    });
  } catch (err) {
    console.error(
      `View Collection Error (${actualCollectionName || displayNameFromUrl}):`,
      err
    );
    next(err);
  }
};

exports.showAddForm = (req, res) => {
  const displayNameFromUrl = req.params.name;
  const targetUserIdForAdminView = req.query.targetUser || null;
  res.render("add_document", {
    collectionName: displayNameFromUrl,
    targetUserIdForAdminView: targetUserIdForAdminView, // Передаємо для формування action у формі
  });
};

exports.addDocument = async (req, res, next) => {
  const displayNameFromUrl = req.params.name;
  let actualCollectionName;
  const { keys, types, values } = req.body;
  const targetUserIdForAdminView = req.query.targetUser || null; // Для редиректу

  try {
    // Для addDocument, getActualCollectionNameAndVerify має правильно працювати з req.query.targetUser
    actualCollectionName = getActualCollectionNameAndVerify(
      req,
      displayNameFromUrl
    );

    if (
      !keys ||
      !types ||
      !values ||
      !Array.isArray(keys) ||
      keys.length !== types.length ||
      keys.length !== values.length
    ) {
      throw new Error(
        "Неправильні дані форми: масиви ключів, типів та значень не співпадають або відсутні."
      );
    }
    const newDocument = {};
    for (let i = 0; i < keys.length; i++) {
      const key = (keys[i] || "").trim();
      if (key) newDocument[key] = convertToType(values[i], types[i]);
    }
    await mongoose.connection.db
      .collection(actualCollectionName)
      .insertOne(newDocument);

    let redirectUrl = `/db/${displayNameFromUrl}`;
    if (targetUserIdForAdminView) {
      redirectUrl += `?targetUser=${targetUserIdForAdminView}`;
    }
    res.redirect(redirectUrl);
  } catch (err) {
    console.error(
      `Add Document Error (${actualCollectionName || displayNameFromUrl}):`,
      err
    );
    // Можливо, варто передати помилку назад у форму додавання
    next(err);
  }
};

exports.showEditForm = async (req, res, next) => {
  const displayNameFromUrl = req.params.name;
  const { id } = req.params;
  const targetUserIdForAdminView = req.query.targetUser || null;
  let actualCollectionName;
  try {
    actualCollectionName = getActualCollectionNameAndVerify(
      req,
      displayNameFromUrl
    );
    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .render("error", { message: "Неправильний ID документа." });
    }
    const document = await mongoose.connection.db
      .collection(actualCollectionName)
      .findOne({ _id: new ObjectId(id) });
    if (!document)
      return res
        .status(404)
        .render("error", { message: "Документ не знайдено." });

    const fieldsData = [];
    for (const key in document) {
      if (key === "_id") continue;
      const value = document[key];
      const type = detectMongoType(value);
      let displayValue =
        type === "Array" || type === "Object"
          ? JSON.stringify(value, null, 2)
          : type === "Date"
          ? value instanceof Date
            ? value.toISOString().split("T")[0]
            : String(value)
          : type === "Boolean"
          ? String(value)
          : String(value);
      fieldsData.push({ key: key, type: type, value: displayValue });
    }
    res.render("edit_document", {
      collectionName: displayNameFromUrl,
      documentId: id,
      fields: fieldsData,
      targetUserIdForAdminView: targetUserIdForAdminView, // Для формування action у формі
    });
  } catch (err) {
    console.error(
      `Show Edit Form Error (${actualCollectionName || displayNameFromUrl}):`,
      err
    );
    next(err);
  }
};

exports.updateDocument = async (req, res, next) => {
  const displayNameFromUrl = req.params.name;
  const { id } = req.params;
  const { keys, types, values } = req.body;
  const targetUserIdForAdminView = req.query.targetUser || null; // Для редиректу
  let actualCollectionName;
  try {
    actualCollectionName = getActualCollectionNameAndVerify(
      req,
      displayNameFromUrl
    );
    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .render("error", { message: "Неправильний ID документа." });
    }
    if (
      !keys ||
      !types ||
      !values ||
      !Array.isArray(keys) ||
      keys.length !== types.length ||
      keys.length !== values.length
    ) {
      throw new Error("Неправильні дані форми.");
    }
    const updatedDocument = {};
    for (let i = 0; i < keys.length; i++) {
      const key = (keys[i] || "").trim();
      if (key) updatedDocument[key] = convertToType(values[i], types[i]);
    }
    const result = await mongoose.connection.db
      .collection(actualCollectionName)
      .updateOne({ _id: new ObjectId(id) }, { $set: updatedDocument });
    if (result.matchedCount === 0)
      return res
        .status(404)
        .render("error", { message: "Документ не знайдено для оновлення." });

    let redirectUrl = `/db/${displayNameFromUrl}`;
    if (targetUserIdForAdminView) {
      redirectUrl += `?targetUser=${targetUserIdForAdminView}`;
    }
    res.redirect(redirectUrl);
  } catch (err) {
    console.error(
      `Update Document Error (${actualCollectionName || displayNameFromUrl}):`,
      err
    );
    next(err);
  }
};

exports.deleteDocumentAjax = async (req, res) => {
  const displayNameFromUrl = req.params.name;
  const { id } = req.params;
  let actualCollectionName;
  try {
    // Важливо: req.query може не бути доступним тут, якщо AJAX запит не містить query параметрів
    // Якщо targetUser потрібен для getActualCollectionNameAndVerify при AJAX, його треба передати в data-атрибути
    // і потім зчитати з req.body або з окремого data-атрибуту кнопки.
    // Поки що припускаємо, що targetUser передається в URL запиту, якщо це потрібно.
    actualCollectionName = getActualCollectionNameAndVerify(
      req,
      displayNameFromUrl
    );

    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Неправильний ID документа." });
    }
    const result = await mongoose.connection.db
      .collection(actualCollectionName)
      .deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 1) {
      res.json({ success: true, message: "Документ успішно видалено." });
    } else {
      res
        .status(404)
        .json({ success: false, message: "Документ не знайдено." });
    }
  } catch (err) {
    console.error(
      `Delete Document AJAX Error (${
        actualCollectionName || displayNameFromUrl
      }):`,
      err
    );
    const status = err.status || 500;
    res
      .status(status)
      .json({ success: false, message: `Помилка видалення: ${err.message}` });
  }
};

exports.deleteCollectionAjax = async (req, res) => {
  const displayNameFromUrl = req.params.name;
  let actualCollectionName;
  try {
    actualCollectionName = getActualCollectionNameAndVerify(
      req,
      displayNameFromUrl
    ); // targetUser буде враховано, якщо є в req.query
    await mongoose.connection.db.dropCollection(actualCollectionName);
    res.json({
      success: true,
      message: `Колекцію "${displayNameFromUrl}" (actual: ${actualCollectionName}) успішно видалено.`,
    });
  } catch (err) {
    console.error(
      `Delete Collection AJAX Error (${
        actualCollectionName || displayNameFromUrl
      }):`,
      err
    );
    const status = err.status || 500;
    if (err.message && err.message.toLowerCase().includes("nsnotfound")) {
      return res.status(404).json({
        success: false,
        message: `Колекція "${displayNameFromUrl}" не знайдена.`,
      });
    }
    res.status(status).json({
      success: false,
      message: `Помилка видалення колекції: ${err.message}`,
    });
  }
};

exports.createIndex = async (req, res, next) => {
  const displayNameFromUrl = req.params.name;
  const { fields, options } = req.body;
  const targetUserIdForAdminView = req.query.targetUser || null; // Для редиректу
  let actualCollectionName;
  try {
    actualCollectionName = getActualCollectionNameAndVerify(
      req,
      displayNameFromUrl
    );
    if (!fields || !Array.isArray(fields))
      throw new Error("Не вказано поля для індексу.");

    const indexKeys = {};
    fields.forEach((field) => {
      if (field && field.key && field.key.trim()) {
        const keyTrimmed = field.key.trim();
        indexKeys[keyTrimmed] =
          field.value === "1" || field.value === "-1"
            ? parseInt(field.value, 10)
            : field.value;
      }
    });
    if (Object.keys(indexKeys).length === 0)
      throw new Error("Не вказано валідні поля для індексу.");

    const indexOptions = {};
    if (options) {
      if (options.name && options.name.trim())
        indexOptions.name = options.name.trim();
      if (options.unique === "true" || options.unique === true)
        indexOptions.unique = true;
      if (options.sparse === "true" || options.sparse === true)
        indexOptions.sparse = true;
      if (options.expireAfterSeconds && options.expireAfterSeconds.trim()) {
        const ttl = parseInt(options.expireAfterSeconds, 10);
        if (!isNaN(ttl) && ttl >= 0) indexOptions.expireAfterSeconds = ttl;
      }
    }
    await mongoose.connection.db
      .collection(actualCollectionName)
      .createIndex(indexKeys, indexOptions);

    let redirectUrl = `/db/${displayNameFromUrl}?message=${encodeURIComponent(
      "Індекс успішно створено"
    )}`;
    if (targetUserIdForAdminView) {
      redirectUrl += `&targetUser=${targetUserIdForAdminView}`;
    }
    res.redirect(redirectUrl);
  } catch (err) {
    console.error(
      `Create Index Error (${actualCollectionName || displayNameFromUrl}):`,
      err
    );
    let errorRedirectUrl = `/db/${displayNameFromUrl}?error=${encodeURIComponent(
      `Помилка створення індексу: ${err.message}`
    )}`;
    if (targetUserIdForAdminView) {
      errorRedirectUrl += `&targetUser=${targetUserIdForAdminView}`;
    }
    res.redirect(errorRedirectUrl);
  }
};

exports.deleteIndex = async (req, res) => {
  const displayNameFromUrl = req.params.name;
  const { indexName } = req.params;
  let actualCollectionName;
  try {
    actualCollectionName = getActualCollectionNameAndVerify(
      req,
      displayNameFromUrl
    ); // targetUser з req.query
    if (indexName === "_id_")
      return res.status(400).json({
        success: false,
        message: "Неможливо видалити базовий індекс _id_.",
      });

    await mongoose.connection.db
      .collection(actualCollectionName)
      .dropIndex(indexName);
    res.json({
      success: true,
      message: `Індекс "${indexName}" успішно видалено.`,
    });
  } catch (err) {
    console.error(
      `Delete Index AJAX Error (${
        actualCollectionName || displayNameFromUrl
      }):`,
      err
    );
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      message: `Помилка видалення індексу: ${err.message}`,
    });
  }
};

exports.exportJson = async (req, res, next) => {
  const displayNameFromUrl = req.params.name;
  let actualCollectionName;
  try {
    actualCollectionName = getActualCollectionNameAndVerify(
      req,
      displayNameFromUrl
    );
    const query = buildQuery(req.query); // query параметри для фільтрації
    const documents = await mongoose.connection.db
      .collection(actualCollectionName)
      .find(query)
      .toArray();
    const fileName = `${displayNameFromUrl}_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.status(200).json(documents);
  } catch (err) {
    console.error(
      `JSON Export Error (${actualCollectionName || displayNameFromUrl}):`,
      err
    );
    next(err);
  }
};

exports.exportCsv = async (req, res, next) => {
  const displayNameFromUrl = req.params.name;
  let actualCollectionName;
  try {
    actualCollectionName = getActualCollectionNameAndVerify(
      req,
      displayNameFromUrl
    );
    const query = buildQuery(req.query); // query параметри для фільтрації
    const documents = await mongoose.connection.db
      .collection(actualCollectionName)
      .find(query)
      .toArray();
    if (documents.length === 0)
      return res.status(404).send("Немає даних для експорту.");

    const parser = new Parser({ unwind: [], pretty: true, excelStrings: true });
    const csv = parser.parse(documents);
    const fileName = `${displayNameFromUrl}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.status(200).send("\uFEFF" + csv);
  } catch (err) {
    console.error(
      `CSV Export Error (${actualCollectionName || displayNameFromUrl}):`,
      err
    );
    next(err);
  }
};
