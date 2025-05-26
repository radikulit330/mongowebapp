require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const User = require("./models/User"); // Переконайтесь, що шлях правильний
const mongoose = require("mongoose");
const {
  getPrefixedCollectionName,
  getDisplayCollectionName,
  formatBytes,
} = require("./utils/helpers"); // Переконайтесь, що шлях правильний

if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.ADMIN_TELEGRAM_ID) {
  console.error(
    "Помилка: Не вказано TELEGRAM_BOT_TOKEN або ADMIN_TELEGRAM_ID у .env"
  );
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_TELEGRAM_ID, 10);

// Middleware для перевірки, чи це адмін
bot.use(async (ctx, next) => {
  if (ctx.from.id !== ADMIN_ID) {
    console.warn(
      `Несанкціонована спроба доступу від ID: ${ctx.from.id} (@${
        ctx.from.username || "N/A"
      })`
    );
    return ctx.reply("Вибачте, у вас немає доступу до цього бота.");
  }
  await next(); // Якщо це адмін, продовжуємо
});

// /start - Привітання та головне меню
bot.start((ctx) => {
  ctx.reply(
    "Вітаю, Адміністраторе! Оберіть дію:",
    Markup.keyboard([
      ["📋 Список користувачів"],
      ["➕ Додати користувача"],
      ["📊 Статистика користувача (загальна)"],
    ]).resize()
  );
});

// --- СПИСОК КОРИСТУВАЧІВ ---
bot.hears("📋 Список користувачів", listUsersWithActions);
bot.command("list", listUsersWithActions);

async function listUsersWithActions(ctx) {
  try {
    const users = await User.find({}, "username email _id createdAt"); // Додаємо createdAt для інформації
    if (users.length === 0) {
      return ctx.reply("Користувачів ще немає.");
    }

    // Збираємо повідомлення та кнопки
    let message = "👤 **Оберіть користувача для дій:**\n";
    const inlineKeyboardButtons = [];

    users.forEach((user) => {
      let userInfo = `*${user.username}*`;
      if (user.email) {
        userInfo += ` (📧 ${user.email})`;
      }
      // userInfo += `\nСтворено: ${user.createdAt.toLocaleDateString('uk-UA')}`; // Можна додати дату створення

      // Додаємо інформацію про користувача як текст, а не кнопку, якщо не хочемо, щоб вона була клікабельна сама по собі
      // ctx.replyWithMarkdown(userInfo); // Якщо хочемо окремими повідомленнями

      if (user.username === "admin") {
        inlineKeyboardButtons.push([
          Markup.button.callback(
            `👑 ${user.username} (Admin) ${
              user.email ? "- " + user.email : ""
            }`,
            `no_action_admin`
          ),
        ]);
      } else {
        // Додаємо кнопки дій для кожного користувача
        inlineKeyboardButtons.push(
          [
            Markup.button.callback(
              `👤 ${user.username} ${user.email ? "(" + user.email + ")" : ""}`,
              `user_details_${user._id}`
            ),
          ], // Можна реалізувати деталі
          [
            Markup.button.callback(
              "📜 Колекції",
              `list_collections_${user._id}`
            ),
            Markup.button.callback("🗑️ Видалити", `delete_user_${user._id}`),
          ]
        );
      }
    });

    if (
      users.length === 1 &&
      users[0].username === "admin" &&
      inlineKeyboardButtons.length === 1
    ) {
      return ctx.replyWithMarkdown(
        message +
          `\n🔹 \`${users[0].username}\` (Admin) ${
            users[0].email ? "(📧 " + users[0].email + ")" : ""
          }\nНемає інших користувачів для відображення дій.`
      );
    }

    // Надсилаємо одне повідомлення з усіма кнопками
    ctx.replyWithMarkdown(
      message,
      Markup.inlineKeyboard(inlineKeyboardButtons)
    );
  } catch (err) {
    console.error("Bot List Users Actions Error:", err);
    ctx.reply("Помилка отримання списку користувачів.");
  }
}
bot.action("no_action_admin", (ctx) =>
  ctx.answerCbQuery(
    "Для адміністратора дії виконуються через інші команди або веб-інтерфейс."
  )
);
bot.action(/user_details_(.+)/, async (ctx) => {
  const userId = ctx.match[1];
  try {
    const user = await User.findById(userId, "username email createdAt");
    if (!user)
      return ctx.answerCbQuery("Користувача не знайдено.", {
        show_alert: true,
      });
    const userDetailsMsg = `*Деталі користувача:*\nІм'я: \`${
      user.username
    }\`\nEmail: ${
      user.email ? `\`${user.email}\`` : "_не вказано_"
    }\nСтворено: ${user.createdAt.toLocaleString("uk-UA")}`;
    await ctx.editMessageText(userDetailsMsg, { parse_mode: "Markdown" }); // Або ctx.reply, якщо editMessageText не підходить
    ctx.answerCbQuery();
  } catch (error) {
    console.error("Bot User Details Error:", error);
    ctx.answerCbQuery("Помилка завантаження деталей.", { show_alert: true });
  }
});

// --- ДОДАВАННЯ КОРИСТУВАЧА ---
bot.hears("➕ Додати користувача", (ctx) => {
  ctx.reply(
    "Щоб додати користувача, надішліть команду у форматі:\n`/add <username> <password> [email]`\n\n*Email є опціональним.*\n*Приклад 1: /add user1 pass123*\n*Приклад 2: /add user2 pass456 user2@example.com*"
  );
});
bot.command("add", async (ctx) => {
  const input = ctx.message.text.split(" ").slice(1);
  if (input.length < 2 || input.length > 3) {
    return ctx.reply(
      "Неправильний формат. Використовуйте: `/add <username> <password> [email]`"
    );
  }
  const [username, password, email] = input;
  if (password.length < 6) {
    return ctx.reply("Пароль має бути не менше 6 символів.");
  }
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return ctx.reply(`Користувач з іменем "${username}" вже існує.`);
    }
    const userData = { username, password };
    if (email) {
      if (!/\S+@\S+\.\S+/.test(email)) {
        // Проста валідація email
        return ctx.reply("Надано неправильний формат email.");
      }
      userData.email = email;
    }
    await User.create(userData);
    ctx.reply(
      `✅ Користувача "${username}" ${
        email ? "з email " + email : ""
      } успішно додано!`
    );
  } catch (err) {
    console.error("Bot Add User Error:", err);
    if (err.errors && err.errors.email) {
      ctx.reply(`Помилка додавання користувача: ${err.errors.email.message}`);
    } else if (err.code === 11000 && err.keyPattern && err.keyPattern.email) {
      ctx.reply(
        `Помилка додавання користувача: Цей email "${email}" вже використовується.`
      );
    } else if (
      err.code === 11000 &&
      err.keyPattern &&
      err.keyPattern.username
    ) {
      ctx.reply(
        `Помилка додавання користувача: Користувач "${username}" вже існує.`
      );
    } else {
      ctx.reply(`Помилка додавання користувача: ${err.message}`);
    }
  }
});

// --- ВИДАЛЕННЯ КОРИСТУВАЧА ---
bot.action(/delete_user_(.+)/, async (ctx) => {
  const userIdToDelete = ctx.match[1];
  try {
    const user = await User.findById(userIdToDelete);
    if (!user) {
      return ctx.answerCbQuery("Користувача вже видалено.", {
        show_alert: true,
      });
    }
    if (user.username === "admin") {
      // Подвійна перевірка
      return ctx.answerCbQuery('Неможливо видалити користувача "admin"!', {
        show_alert: true,
      });
    }
    await User.deleteOne({ _id: userIdToDelete });
    await ctx.editMessageText(
      `✅ Користувача "${user.username}" видалено. \nЙого префіксовані колекції (якщо були) залишились в базі даних.`
    );
    ctx.answerCbQuery("Видалено!");
  } catch (err) {
    console.error("Bot Delete Action Error:", err);
    ctx.answerCbQuery("Помилка видалення.", { show_alert: true });
    try {
      await ctx.editMessageText("Сталася помилка під час видалення.");
    } catch (e) {
      ctx.reply("Сталася помилка під час видалення.");
    }
  }
});

// --- РОБОТА З КОЛЕКЦІЯМИ КОРИСТУВАЧА ---
bot.action(/list_collections_(.+)/, async (ctx) => {
  const userId = ctx.match[1];
  try {
    const user = await User.findById(userId);
    if (!user) {
      await ctx.editMessageText(`Користувача з ID ${userId} не знайдено.`);
      return ctx.answerCbQuery("Користувача не знайдено.", {
        show_alert: true,
      });
    }

    if (user.username === "admin") {
      await ctx.editMessageText(
        `Адміністратор має доступ до всіх колекцій через веб-інтерфейс. Ця функція для перегляду префіксованих колекцій конкретних користувачів.`
      );
      return ctx.answerCbQuery();
    }

    const allCollectionsRaw = await mongoose.connection.db
      .listCollections()
      .toArray();
    const userCollections = [];
    for (const coll of allCollectionsRaw) {
      const displayName = getDisplayCollectionName(coll.name, userId);
      if (displayName) {
        userCollections.push({ displayName, actualName: coll.name });
      }
    }

    if (userCollections.length === 0) {
      await ctx.editMessageText(
        `У користувача "${user.username}" немає власних (префіксованих) колекцій.`
      );
      return ctx.answerCbQuery();
    }

    const inlineKeyboard = userCollections.map((coll) => [
      Markup.button.callback(
        `📊 ${coll.displayName}`,
        `coll_stats_${userId}_${coll.displayName}`
      ),
      Markup.button.callback(
        "🗑️ Видалити",
        `delete_collection_${userId}_${coll.displayName}`
      ),
    ]);

    await ctx.editMessageText(
      `Колекції користувача "${user.username}":`,
      Markup.inlineKeyboard(inlineKeyboard)
    );
    ctx.answerCbQuery();
  } catch (err) {
    console.error("Bot List User Collections Error:", err);
    try {
      await ctx.editMessageText("Помилка отримання колекцій користувача.");
    } catch (e) {
      ctx.reply("Помилка отримання колекцій користувача.");
    }
    ctx.answerCbQuery("Помилка.", { show_alert: true });
  }
});

bot.action(/coll_stats_(.+?)_(.+)/, async (ctx) => {
  const userId = ctx.match[1];
  const collectionDisplayName = ctx.match[2];
  let actualCollectionName = "";

  try {
    const user = await User.findById(userId);
    if (!user) {
      await ctx.editMessageText(`Користувача з ID ${userId} не знайдено.`);
      return ctx.answerCbQuery("Користувача не знайдено.", {
        show_alert: true,
      });
    }

    actualCollectionName = getPrefixedCollectionName(
      userId,
      collectionDisplayName
    );
    console.log(
      `[Bot Stats] Запит статистики для: ${actualCollectionName} (користувач: ${user.username}, display: ${collectionDisplayName})`
    );

    const collectionExists = await mongoose.connection.db
      .listCollections({ name: actualCollectionName })
      .hasNext();
    if (!collectionExists) {
      const msg = `Колекція "${collectionDisplayName}" (реальна: ${actualCollectionName}) не знайдена для користувача ${user.username}.`;
      console.warn(`[Bot Stats] ${msg}`);
      await ctx.editMessageText(msg);
      return ctx.answerCbQuery(
        `Колекція "${collectionDisplayName}" не знайдена.`,
        { show_alert: true }
      );
    }

    // Використовуємо db.command для отримання статистики
    const rawStats = await mongoose.connection.db.command({
      collStats: actualCollectionName,
    });

    if (!rawStats || !rawStats.ok) {
      const msg = `Не вдалося отримати статистику для "${collectionDisplayName}" користувача ${user.username}. Відповідь від команди collStats не успішна або порожня.`;
      console.warn(`[Bot Stats] ${msg}`, rawStats);
      await ctx.editMessageText(msg);
      return ctx.answerCbQuery(`Не вдалося отримати статистику.`, {
        show_alert: true,
      });
    }

    const statsMsg = `📊 *Статистика для "${collectionDisplayName}"* (користувач: ${
      user.username
    })
        - Документів: \`${rawStats.count || 0}\`
        - Розмір даних: \`${formatBytes(rawStats.size || 0)}\`
        - Розмір сховища: \`${formatBytes(rawStats.storageSize || 0)}\`
        - К-сть індексів: \`${rawStats.nindexes || 0}\`
        - Загальний розмір індексів: \`${formatBytes(
          rawStats.totalIndexSize || 0
        )}\``;

    try {
      await ctx.editMessageText(statsMsg, { parse_mode: "Markdown" });
    } catch (e) {
      console.warn(
        "[Bot Stats] Не вдалося відредагувати повідомлення, надсилаю нове:",
        e.message
      );
      await ctx.replyWithMarkdown(statsMsg);
    }
    ctx.answerCbQuery("Статистику завантажено.");
  } catch (err) {
    console.error(
      `Bot Collection Stats Error (actualCollectionName: "${actualCollectionName}", display: "${collectionDisplayName}", userId: "${userId}"):`,
      err
    );
    const userErrorMessage = `Помилка отримання статистики для "${collectionDisplayName}". Деталі в логах сервера.`;
    try {
      await ctx.editMessageText(userErrorMessage);
    } catch (editError) {
      await ctx.reply(userErrorMessage);
    }
    ctx.answerCbQuery("Помилка отримання статистики.", { show_alert: true });
  }
});

bot.action(/delete_collection_(.+?)_(.+)/, async (ctx) => {
  const userId = ctx.match[1];
  const collectionDisplayName = ctx.match[2];
  const actualCollectionName = getPrefixedCollectionName(
    userId,
    collectionDisplayName
  );
  const user = await User.findById(userId);

  try {
    await mongoose.connection.db.dropCollection(actualCollectionName);
    await ctx.editMessageText(
      `✅ Колекцію "${collectionDisplayName}" користувача "${
        user ? user.username : "N/A"
      }" видалено.`
    );
    ctx.answerCbQuery("Колекцію видалено!");
  } catch (err) {
    console.error(
      `Bot Delete Collection Error (${actualCollectionName}):`,
      err
    );
    if (err.message && err.message.toLowerCase().includes("nsnotfound")) {
      await ctx.editMessageText(
        `Колекція "${collectionDisplayName}" вже не існує.`
      );
      return ctx.answerCbQuery("Колекція не знайдена.", { show_alert: true });
    }
    try {
      await ctx.editMessageText(
        `Помилка видалення колекції "${collectionDisplayName}".`
      );
    } catch (e) {
      await ctx.reply(`Помилка видалення колекції "${collectionDisplayName}".`);
    }
    ctx.answerCbQuery(`Помилка видалення колекції.`, { show_alert: true });
  }
});

// --- ЗАГАЛЬНА СТАТИСТИКА КОРИСТУВАЧА (список його колекцій) ---
bot.hears("📊 Статистика користувача (загальна)", userStatsListPrompt);
bot.command("userstats", userStatsListPrompt); // Стара команда для цього

function userStatsListPrompt(ctx) {
  ctx.reply(
    "Введіть ім'я користувача або ID для перегляду списку його колекцій:\n`/getcollections <username_or_id>` (раніше getstats)"
  );
}
bot.command("getcollections", async (ctx) => {
  // Змінено команду для ясності
  const args = ctx.message.text.split(" ").slice(1);
  if (args.length !== 1) {
    return ctx.reply(
      "Неправильний формат. Використовуйте: `/getcollections <username_or_id>`"
    );
  }
  const identifier = args[0];
  try {
    let user = await User.findOne({ username: identifier });
    if (!user && mongoose.Types.ObjectId.isValid(identifier)) {
      user = await User.findById(identifier);
    }
    if (!user) {
      return ctx.reply(`Користувача "${identifier}" не знайдено.`);
    }
    if (user.username === "admin") {
      return ctx.reply(
        "Адміністратор має доступ до всіх колекцій через веб-інтерфейс. Ця команда для перегляду префіксованих колекцій конкретних користувачів."
      );
    }

    const allCollectionsRaw = await mongoose.connection.db
      .listCollections()
      .toArray();
    const userCollectionsInfo = [];
    for (const coll of allCollectionsRaw) {
      const displayName = getDisplayCollectionName(
        coll.name,
        user._id.toString()
      );
      if (displayName) {
        const collectionDB = mongoose.connection.db.collection(coll.name); // Використовуємо повну назву
        userCollectionsInfo.push({
          name: displayName,
          count: await collectionDB.countDocuments(),
        });
      }
    }

    if (userCollectionsInfo.length === 0) {
      return ctx.reply(
        `У користувача "${user.username}" немає власних (префіксованих) колекцій.`
      );
    }

    let message = `📊 *Колекції користувача ${user.username}:*\n\n`;
    userCollectionsInfo.forEach((info) => {
      message += `  🔹 \`${info.name}\` (Документів: ${info.count})\n`;
    });
    ctx.replyWithMarkdown(message);
  } catch (err) {
    console.error("Bot Get User Collections Error:", err);
    ctx.reply("Помилка отримання колекцій користувача.");
  }
});

// --- Загальний обробник помилок ---
bot.catch((err, ctx) => {
  console.error(
    `Помилка для ${ctx.updateType} (user: @${
      ctx.from.username || ctx.from.id
    }):`,
    err
  );
  ctx.reply(
    "Ой, щось пішло не так... Спробуйте пізніше або зверніться до адміністратора."
  );
});

// --- Запуск бота ---
const launchBot = () => {
  console.log("Запуск Telegram бота...");
  bot
    .launch()
    .then(() => console.log("Telegram бот успішно запущено."))
    .catch((err) => console.error("Помилка запуску Telegram бота:", err));
};
module.exports = { launchBot };

process.once("SIGINT", () => {
  console.log("Отримано SIGINT, зупиняємо бота...");
  bot.stop("SIGINT");
  process.exit(0);
});
process.once("SIGTERM", () => {
  console.log("Отримано SIGTERM, зупиняємо бота...");
  bot.stop("SIGTERM");
  process.exit(0);
});
