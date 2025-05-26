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
} = require("../utils/helpers");

// Допоміжна функція для отримання актуальної назви колекції в БД
// та перевірки доступу для не-адмінів
const getActualCollectionNameAndVerify = (req, displayNameFromUrl) => {
  let actualCollectionName;
  if (!displayNameFromUrl || typeof displayNameFromUrl !== "string") {
    const err = new Error("Неправильна або відсутня назва колекції.");
    err.status = 400; // Bad Request
    throw err;
  }

  if (req.session.isAdmin) {
    actualCollectionName = displayNameFromUrl;
  } else {
    actualCollectionName = getPrefixedCollectionName(
      req.session.userId,
      displayNameFromUrl
    );
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
    }
    res.locals.currentContext = "collections";
    res.render("index", { collections: userVisibleCollections });
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
  try {
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
    let tableHeaders = ["_id"]; // Починаємо з _id

    try {
      totalDocuments = await collection.countDocuments(query);
      documents = await collection
        .find(query)
        .skip(skip)
        .limit(limit)
        .toArray();

      // Збираємо всі унікальні ключі для заголовків таблиці з поточних документів
      const allKeys = new Set();
      documents.forEach((doc) => {
        Object.keys(doc).forEach((key) => allKeys.add(key));
      });
      // Формуємо заголовки, _id завжди перший, решта - сортовані
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
        totalDocuments = 0; // Скидаємо документи, якщо індексу немає
      } else {
        throw err;
      }
    }

    // Отримуємо поля для розширеного фільтра (з усіх документів, що відповідають запиту, але обмежуємо вибірку)
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
    res.locals.queryString = req.url.includes("?")
      ? req.url.substring(req.url.indexOf("?"))
      : "";

    res.render("collection", {
      collectionName: displayNameFromUrl,
      documents: documents,
      fields: fieldsForFilter, // Поля для розширеного фільтра
      tableHeaders: tableHeaders, // Заголовки для таблиці даних
      currentPage: page,
      totalPages: Math.ceil(totalDocuments / limit),
      limit: limit,
      searchMessage: searchMessage,
      stats: stats,
      indexes: indexes,
      currentField: req.query.field || "",
      currentValue: req.query.value || "",
      // Передаємо хелпери в шаблон EJS
      helpers: {
        detectMongoType,
        formatBytes, // Якщо потрібен
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
  res.render("add_document", { collectionName: displayNameFromUrl });
};

exports.addDocument = async (req, res, next) => {
  const displayNameFromUrl = req.params.name;
  let actualCollectionName;
  const { keys, types, values } = req.body;
  try {
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
    res.redirect(`/db/${displayNameFromUrl}`);
  } catch (err) {
    console.error(
      `Add Document Error (${actualCollectionName || displayNameFromUrl}):`,
      err
    );
    next(err);
  }
};

exports.showEditForm = async (req, res, next) => {
  const displayNameFromUrl = req.params.name;
  const { id } = req.params;
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
          ? String(value) // 'true' or 'false'
          : String(value);
      fieldsData.push({ key: key, type: type, value: displayValue });
    }
    res.render("edit_document", {
      collectionName: displayNameFromUrl,
      documentId: id,
      fields: fieldsData,
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
    res.redirect(`/db/${displayNameFromUrl}`);
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
    );
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
      return res
        .status(404)
        .json({
          success: false,
          message: `Колекція "${displayNameFromUrl}" не знайдена.`,
        });
    }
    res
      .status(status)
      .json({
        success: false,
        message: `Помилка видалення колекції: ${err.message}`,
      });
  }
};

exports.createIndex = async (req, res, next) => {
  const displayNameFromUrl = req.params.name;
  const { fields, options } = req.body;
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
        indexOptions.unique = true; // Checkbox value
      if (options.sparse === "true" || options.sparse === true)
        indexOptions.sparse = true; // Checkbox value
      if (options.expireAfterSeconds && options.expireAfterSeconds.trim()) {
        const ttl = parseInt(options.expireAfterSeconds, 10);
        if (!isNaN(ttl) && ttl >= 0) indexOptions.expireAfterSeconds = ttl;
      }
    }
    await mongoose.connection.db
      .collection(actualCollectionName)
      .createIndex(indexKeys, indexOptions);
    res.redirect(
      `/db/${displayNameFromUrl}?message=${encodeURIComponent(
        "Індекс успішно створено"
      )}`
    );
  } catch (err) {
    console.error(
      `Create Index Error (${actualCollectionName || displayNameFromUrl}):`,
      err
    );
    res.redirect(
      `/db/${displayNameFromUrl}?error=${encodeURIComponent(
        `Помилка створення індексу: ${err.message}`
      )}`
    );
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
    );
    if (indexName === "_id_")
      return res
        .status(400)
        .json({
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
    res
      .status(status)
      .json({
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
    const query = buildQuery(req.query);
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
    const query = buildQuery(req.query);
    const documents = await mongoose.connection.db
      .collection(actualCollectionName)
      .find(query)
      .toArray();
    if (documents.length === 0)
      return res.status(404).send("Немає даних для експорту.");

    const parser = new Parser({ unwind: [], pretty: true, excelStrings: true }); // excelStrings for better UTF-8 in Excel
    const csv = parser.parse(documents);
    const fileName = `${displayNameFromUrl}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.status(200).send("\uFEFF" + csv); // BOM for Excel UTF-8
  } catch (err) {
    console.error(
      `CSV Export Error (${actualCollectionName || displayNameFromUrl}):`,
      err
    );
    next(err);
  }
};
