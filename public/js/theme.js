document.addEventListener("DOMContentLoaded", () => {
  const themeToggleBtn = document.getElementById("theme-toggle");
  const themeIcon = themeToggleBtn
    ? themeToggleBtn.querySelector(".theme-icon")
    : null;
  const htmlElement = document.documentElement; // Працюємо з <html> для кращого FOUC prevention

  if (!themeToggleBtn || !themeIcon) {
    console.warn("Кнопка зміни теми або її іконка не знайдені.");
    return;
  }

  /**
   * Застосовує вибрану тему до <html> та оновлює іконку кнопки.
   * @param {string} theme - Назва теми ('light' або 'dark').
   */
  const applyTheme = (theme) => {
    if (theme === "dark") {
      htmlElement.classList.add("dark-theme");
      htmlElement.classList.remove("light-theme");
      themeIcon.textContent = "light_mode"; // Показуємо сонце
    } else {
      htmlElement.classList.add("light-theme");
      htmlElement.classList.remove("dark-theme");
      themeIcon.textContent = "dark_mode"; // Показуємо місяць
    }
  };

  // Отримуємо поточну тему з localStorage або встановлюємо 'light'
  // Скрипт в <head> вже застосував її, тут ми лише синхронізуємо іконку.
  let currentTheme = localStorage.getItem("theme") || "light";
  applyTheme(currentTheme); // Застосовуємо, щоб встановити правильну іконку

  // Додаємо обробник кліку на кнопку
  themeToggleBtn.addEventListener("click", () => {
    // Визначаємо нову тему
    let newTheme = htmlElement.classList.contains("dark-theme")
      ? "light"
      : "dark";
    // Зберігаємо вибір у localStorage
    localStorage.setItem("theme", newTheme);
    // Застосовуємо нову тему
    applyTheme(newTheme);
  });
});
