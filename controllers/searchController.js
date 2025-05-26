const mongoose = require("mongoose");
const {
  buildQuery,
  getPrefixedCollectionName,
  getDisplayCollectionName,
  parsePrefixedName,
} = require("../utils/helpers");

// Допоміжна функція для отримання актуальної назви колекції в БД (для searchController)
const getActualSearchCollectionName = (req, displayNameFromContext) => {
  if (req.session.isAdmin) {
    return displayNameFromContext;
  } else {
    return getPrefixedCollectionName(
      req.session.userId,
      displayNameFromContext
    );
  }
};

exports.performSearch = async (req, res) => {
  const q = (req.query.q || "").trim();
  const context = req.query.context || "collections"; // context - це displayName для колекції

  res.locals.searchTerm = q;

  try {
    if (context === "collections") {
      const allCollectionsRaw = await mongoose.connection.db
        .listCollections()
        .toArray();
      let filteredVisible = [];

      if (req.session.isAdmin) {
        filteredVisible = allCollectionsRaw
          .filter((c) =>
            q ? c.name.toLowerCase().includes(q.toLowerCase()) : true
          )
          .map((c) => {
            const { ownerId, displayName } = parsePrefixedName(c.name);
            // Для адміна name - це actualName, використовується в URL для перегляду
            return {
              name: c.name,
              displayNameForCard: ownerId
                ? `${displayName} (by ${ownerId.substring(0, 4)}...)`
                : displayName,
              ownerId,
            };
          });
      } else {
        const userId = req.session.userId;
        filteredVisible = allCollectionsRaw
          .map((c) => {
            const displayName = getDisplayCollectionName(c.name, userId);
            // Для користувача name - це displayName
            return displayName
              ? {
                  name: displayName,
                  displayNameForCard: displayName,
                  isOwned: true,
                }
              : null;
          })
          .filter(
            (c) =>
              c !== null &&
              (q ? c.name.toLowerCase().includes(q.toLowerCase()) : true)
          );
      }
      res.locals.currentContext = "collections";
      return res.render("index", { collections: filteredVisible });
    } else {
      const displayNameFromContext = context;
      const actualCollectionName = getActualSearchCollectionName(
        req,
        displayNameFromContext
      );

      if (
        !req.session.isAdmin &&
        !actualCollectionName.startsWith(req.session.userId + "_")
      ) {
        return res
          .status(403)
          .render("error", {
            message: "Доступ заборонено до пошуку в цій колекції.",
          });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10; // Або з налаштувань
      const skip = (page - 1) * limit;
      const collection =
        mongoose.connection.db.collection(actualCollectionName);
      const query = buildQuery(req.query);

      let documents = [];
      let totalDocuments = 0;
      let searchMessage = null;
      let fields = []; // Для фільтра на сторінці колекції

      try {
        totalDocuments = await collection.countDocuments(query);
        documents = await collection
          .find(query)
          .skip(skip)
          .limit(limit)
          .toArray();

        const sampleDocs = await collection.find({}).limit(50).toArray();
        const fieldSet = new Set(["_id"]);
        sampleDocs.forEach((doc) =>
          Object.keys(doc).forEach((key) => fieldSet.add(key))
        );
        fields = Array.from(fieldSet).sort();

        if (q)
          searchMessage = `Знайдено ${totalDocuments} результатів для "${q}" у "${displayNameFromContext}".`;
      } catch (err) {
        /* ... обробка помилок індексу ... */
      }

      res.locals.currentContext = displayNameFromContext;
      res.render("collection", {
        collectionName: displayNameFromContext,
        documents: documents,
        fields: fields,
        currentPage: page,
        totalPages: Math.ceil(totalDocuments / limit),
        limit: limit,
        searchMessage: searchMessage,
        // Статистику та індекси краще не завантажувати на сторінці пошуку,
        // або робити це окремим запитом, якщо вони потрібні
        stats: { note: "Статистика не відображається для результатів пошуку." },
        indexes: [
          {
            name: "Info",
            key: { info: "Індекси не відображаються для результатів пошуку." },
          },
        ],
        currentField: req.query.field || "",
        currentValue: req.query.value || "",
      });
    }
  } catch (err) {
    /* ... */
  }
};
