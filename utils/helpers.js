// utils/helpers.js

const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");

const formatBytes = (bytes, decimals = 2) => {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const detectMongoType = (value) => {
  if (value instanceof ObjectId) return "ObjectId";
  if (value instanceof Date) return "Date";
  if (typeof value === "number") return "Number";
  if (typeof value === "boolean") return "Boolean";
  if (Array.isArray(value)) return "Array";
  if (typeof value === "object" && value !== null) return "Object";
  return "String";
};

const convertToType = (value, type) => {
  try {
    switch (type) {
      case "Number":
        const num = Number(value);
        if (isNaN(num)) throw new Error(`'${value}' не є числом.`);
        return num;
      case "Boolean":
        return (
          String(value).toLowerCase() === "true" ||
          value === "1" ||
          value === "on"
        );
      case "Date":
        const date = new Date(value);
        if (isNaN(date.getTime()))
          throw new Error(`'${value}' не є валідною датою.`);
        return date;
      case "ObjectId":
        if (!ObjectId.isValid(value))
          throw new Error(`'${value}' не є валідним ObjectId.`);
        return new ObjectId(value);
      case "Array":
      case "Object":
        return JSON.parse(value);
      case "String":
      default:
        return String(value);
    }
  } catch (err) {
    console.error(`Помилка конвертації: ${value} -> ${type}. ${err.message}`);
    throw new Error(
      `Помилка конвертації для "${value}" у тип ${type}: ${err.message}`
    );
  }
};

const buildQuery = (queryParams) => {
  const q = (queryParams.q || "").trim();
  const field = queryParams.field || "";
  const value = queryParams.value || "";
  let query = {};
  if (field && value) {
    query[field] = { $regex: value, $options: "i" };
  } else if (q) {
    query = { $text: { $search: q } };
  }
  return query;
};

const getPrefixedCollectionName = (userId, displayName) => {
  if (!userId || !displayName)
    throw new Error("UserId and displayName are required for prefixing.");
  return `${userId}_${displayName}`;
};

const getDisplayCollectionName = (prefixedName, userId) => {
  const prefix = `${userId}_`;
  if (prefixedName.startsWith(prefix)) {
    return prefixedName.substring(prefix.length);
  }
  return null; // Якщо це не колекція користувача
};

const parsePrefixedName = (prefixedName) => {
  const parts = prefixedName.split("_");
  if (parts.length > 1 && mongoose.Types.ObjectId.isValid(parts[0])) {
    return { ownerId: parts[0], displayName: parts.slice(1).join("_") };
  }
  return { ownerId: null, displayName: prefixedName };
};

/**
 * Розраховує загальний дисковий простір та розмір даних, використаний колекціями користувача.
 * @param {string} userId - ID користувача.
 * @returns {Promise<{storageSize: number, dataSize: number}>} - Об'єкт з розмірами у байтах.
 */
const getUserStorageUsage = async (userId) => {
  let totalStorageSize = 0;
  let totalDataSize = 0; // <-- ДОДАНО
  console.log(`[DEBUG] Розрахунок сховища для UserID: ${userId}`);
  try {
    const allCollectionsRaw = await mongoose.connection.db
      .listCollections()
      .toArray();
    console.log(
      `[DEBUG] Знайдено ${allCollectionsRaw.length} колекцій всього.`
    );
    const userPrefix = `${userId}_`;

    for (const coll of allCollectionsRaw) {
      if (coll.name.startsWith(userPrefix)) {
        console.log(`[DEBUG] Знайдено колекцію користувача: ${coll.name}`);
        try {
          const stats = await mongoose.connection.db
            .collection(coll.name)
            .stats();
          const currentStorageSize = stats.storageSize || 0;
          const currentDataSize = stats.size || 0; // <-- ОТРИМУЄМО SIZE
          console.log(
            `[DEBUG]   -> storageSize: ${currentStorageSize}, dataSize: ${currentDataSize}`
          ); // <-- ОНОВЛЕНО ЛОГ
          totalStorageSize += currentStorageSize;
          totalDataSize += currentDataSize; // <-- ДОДАЄМО SIZE
        } catch (statsErr) {
          console.error(
            `[DEBUG] Не вдалося отримати статистику для ${coll.name}:`,
            statsErr
          );
        }
      }
    }
    console.log(
      `[DEBUG] Загальний розмір для ${userId}: storage=${totalStorageSize}, data=${totalDataSize}`
    ); // <-- ОНОВЛЕНО ЛОГ
    return { storageSize: totalStorageSize, dataSize: totalDataSize }; // <-- ПОВЕРТАЄМО ОБ'ЄКТ
  } catch (err) {
    console.error(
      `[DEBUG] Помилка підрахунку використання сховища для UserID ${userId}:`,
      err
    );
    return { storageSize: -1, dataSize: -1 }; // <-- ПОВЕРТАЄМО ОБ'ЄКТ ПОМИЛКИ
  }
};

module.exports = {
  formatBytes,
  detectMongoType,
  convertToType,
  buildQuery,
  getPrefixedCollectionName,
  getDisplayCollectionName,
  parsePrefixedName,
  getUserStorageUsage,
};
