const { ObjectId } = require('mongodb');
const mongoose = require('mongoose'); // Потрібен для mongoose.Types.ObjectId

const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const detectMongoType = (value) => {
    if (value instanceof ObjectId) return 'ObjectId';
    if (value instanceof Date) return 'Date';
    if (typeof value === 'number') return 'Number';
    if (typeof value === 'boolean') return 'Boolean';
    if (Array.isArray(value)) return 'Array';
    if (typeof value === 'object' && value !== null) return 'Object';
    return 'String';
};

const convertToType = (value, type) => {
    try {
        switch (type) {
            case 'Number':
                const num = Number(value);
                if (isNaN(num)) throw new Error(`'${value}' не є числом.`);
                return num;
            case 'Boolean':
                return String(value).toLowerCase() === 'true' || value === '1' || value === 'on';
            case 'Date':
                const date = new Date(value);
                if (isNaN(date.getTime())) throw new Error(`'${value}' не є валідною датою.`);
                return date;
            case 'ObjectId':
                if (!ObjectId.isValid(value)) throw new Error(`'${value}' не є валідним ObjectId.`);
                return new ObjectId(value);
            case 'Array':
            case 'Object':
                return JSON.parse(value);
            case 'String':
            default:
                return String(value);
        }
    } catch (err) {
        console.error(`Помилка конвертації: ${value} -> ${type}. ${err.message}`);
        throw new Error(`Помилка конвертації для "${value}" у тип ${type}: ${err.message}`);
    }
};

const buildQuery = (queryParams) => {
    const q = (queryParams.q || '').trim();
    const field = queryParams.field || '';
    const value = queryParams.value || '';
    let query = {};
    if (field && value) {
        query[field] = { $regex: value, $options: 'i' };
    } else if (q) {
        query = { $text: { $search: q } };
    }
    return query;
};

// --- НОВІ ФУНКЦІЇ ДЛЯ ПРЕФІКСІВ ---
const getPrefixedCollectionName = (userId, displayName) => {
    if (!userId || !displayName) throw new Error('UserId and displayName are required for prefixing.');
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
    const parts = prefixedName.split('_');
    // Перевіряємо, чи перший елемент є валідним ObjectId (24 hex символи)
    if (parts.length > 1 && mongoose.Types.ObjectId.isValid(parts[0])) {
        return { ownerId: parts[0], displayName: parts.slice(1).join('_') };
    }
    return { ownerId: null, displayName: prefixedName }; // Глобальна або невідомий формат
};


module.exports = {
    formatBytes,
    detectMongoType,
    convertToType,
    buildQuery,
    getPrefixedCollectionName,
    getDisplayCollectionName,
    parsePrefixedName
};
