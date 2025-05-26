/**
 * Функція для зміни типу інпуту залежно від вибраного типу даних.
 * @param {HTMLSelectElement} typeSelect - Елемент select з типом.
 * @param {HTMLDivElement} container - Контейнер для інпуту.
 * @param {string} [currentValue=''] - Поточне значення (для редагування).
 */
const updateValueInput = (typeSelect, container, currentValue = "") => {
  const selectedType = typeSelect.value;
  let newElement;

  switch (selectedType) {
    case "Boolean":
      newElement = document.createElement("select");
      newElement.name = "values[]";
      newElement.innerHTML = `
                <option value="true" ${
                  currentValue === "true" ? "selected" : ""
                }>true</option>
                <option value="false" ${
                  currentValue === "false" ? "selected" : ""
                }>false</option>
            `;
      break;
    case "Date":
      newElement = document.createElement("input");
      newElement.type = "date";
      newElement.name = "values[]";
      newElement.value = currentValue;
      newElement.required = true;
      break;
    case "Array":
    case "Object":
      newElement = document.createElement("textarea");
      newElement.name = "values[]";
      newElement.placeholder = "Значення (JSON)";
      newElement.rows = 3;
      newElement.value = currentValue;
      newElement.required = true;
      break;
    case "Number":
      newElement = document.createElement("input");
      newElement.type = "number";
      newElement.name = "values[]";
      newElement.placeholder = "Значення (число)";
      newElement.value = currentValue;
      newElement.required = true;
      newElement.step = "any"; // Дозволяє дробові числа
      break;
    case "String":
    case "ObjectId":
    default:
      newElement = document.createElement("input");
      newElement.type = "text";
      newElement.name = "values[]";
      newElement.placeholder = "Значення";
      newElement.value = currentValue;
      newElement.required = true;
      break;
  }

  container.innerHTML = ""; // Очищуємо контейнер
  container.appendChild(newElement);
};

// --- Основна логіка після завантаження DOM ---
document.addEventListener("DOMContentLoaded", () => {
  // === Preloader Logic ===
  // Цей listener виконується, коли ВСЯ сторінка завантажена
  window.addEventListener("load", () => {
    const preloader = document.getElementById("preloader");
    if (preloader) {
      preloader.classList.add("hidden");
    }
  });

  // === Hamburger Menu Logic ===
  const hamburger = document.querySelector(".hamburger-icon");
  const menu = document.querySelector(".main-menu");
  if (hamburger && menu) {
    hamburger.addEventListener("click", () => {
      menu.classList.toggle("open");
    });
  }

  // === Dynamic Document Form Logic ===
  const docFieldsContainer = document.getElementById("fields-container");
  const addDocFieldBtn = document.getElementById("add-field-btn");

  if (addDocFieldBtn && docFieldsContainer) {
    addDocFieldBtn.addEventListener("click", () => {
      const row = document.createElement("div");
      row.classList.add("field-row");
      row.innerHTML = `
                <input type="text" name="keys[]" placeholder="Ключ" required>
                <select name="types[]" class="type-select">
                    <option value="String" selected>String</option>
                    <option value="Number">Number</option>
                    <option value="Boolean">Boolean</option>
                    <option value="Date">Date</option>
                    <option value="ObjectId">ObjectId</option>
                    <option value="Array">Array (JSON)</option>
                    <option value="Object">Object (JSON)</option>
                </select>
                <div class="value-input-container">
                     <input type="text" name="values[]" placeholder="Значення" required>
                </div>
                <button type="button" class="button delete-button icon-only remove-field-btn">
                    <span class="material-symbols-outlined">remove</span>
                </button>
            `;
      docFieldsContainer.appendChild(row);
      // Додаємо listener для нового select
      row.querySelector(".type-select").addEventListener("change", (e) => {
        updateValueInput(
          e.target,
          e.target.closest(".field-row").querySelector(".value-input-container")
        );
      });
    });

    // Видалення поля (делегування) + Зміна типу інпуту
    docFieldsContainer.addEventListener("click", (e) => {
      const removeBtn = e.target.closest(".remove-field-btn");
      if (removeBtn) {
        const row = removeBtn.closest(".field-row");
        if (docFieldsContainer.children.length > 1) {
          row.remove();
        } else {
          alert("Повинен бути хоча б один рядок.");
        }
      }
    });
    docFieldsContainer.addEventListener("change", (e) => {
      if (e.target.classList.contains("type-select")) {
        updateValueInput(
          e.target,
          e.target.closest(".field-row").querySelector(".value-input-container")
        );
      }
    });
  }

  // === Dynamic Index Form Logic ===
  const indexFieldsContainer = document.getElementById(
    "index-fields-container"
  );
  const addIndexFieldBtn = document.getElementById("add-index-field-btn");
  let indexFieldCounter = indexFieldsContainer
    ? indexFieldsContainer.children.length
    : 1;

  if (addIndexFieldBtn && indexFieldsContainer) {
    addIndexFieldBtn.addEventListener("click", () => {
      const row = document.createElement("div");
      row.classList.add("field-row", "index-field-row");
      row.innerHTML = `
                <input type="text" name="fields[${indexFieldCounter}][key]" placeholder="Назва поля" required>
                <select name="fields[${indexFieldCounter}][value]">
                    <option value="1">Ascending (1)</option>
                    <option value="-1">Descending (-1)</option>
                    <option value="text">Text</option>
                </select>
                <button type="button" class="button delete-button icon-only remove-index-field-btn">
                    <span class="material-symbols-outlined">remove</span>
                </button>
            `;
      indexFieldsContainer.appendChild(row);
      indexFieldCounter++;
    });

    indexFieldsContainer.addEventListener("click", (e) => {
      const removeBtn = e.target.closest(".remove-index-field-btn");
      if (removeBtn) {
        const row = removeBtn.closest(".index-field-row");
        if (indexFieldsContainer.children.length > 1) {
          row.remove();
        } else {
          alert("Повинен бути хоча б один рядок.");
        }
      }
    });
  }

  // === AJAX Delete Logic & Modal ===
  const modal = document.getElementById("confirmation-modal");
  const modalMessage = document.getElementById("modal-message");
  const closeModalBtn = modal ? modal.querySelector(".close-button") : null;
  const cancelBtn = document.getElementById("modal-cancel-btn");
  const confirmBtn = document.getElementById("modal-confirm-btn");

  let elementToDelete = null;
  let deleteUrl = "";

  const showModal = (message, url, element) => {
    if (!modal) return;
    modalMessage.textContent = message;
    deleteUrl = url;
    elementToDelete = element;
    modal.classList.add("show");
  };

  const hideModal = () => {
    if (modal) modal.classList.remove("show");
    deleteUrl = "";
    elementToDelete = null;
  };

  if (closeModalBtn) closeModalBtn.addEventListener("click", hideModal);
  if (cancelBtn) cancelBtn.addEventListener("click", hideModal);
  window.addEventListener("click", (event) => {
    if (modal && event.target == modal) {
      hideModal();
    }
  });

  if (confirmBtn)
    confirmBtn.addEventListener("click", async () => {
      if (!deleteUrl || !elementToDelete) return;

      try {
        const response = await fetch(deleteUrl, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          // TODO: Додати CSRF токен
        });

        const data = await response.json();

        if (response.ok && data.success) {
          elementToDelete.style.transition =
            "opacity 0.5s ease, transform 0.5s ease";
          elementToDelete.style.opacity = "0";
          elementToDelete.style.transform = "scale(0.8)";
          setTimeout(() => elementToDelete.remove(), 500);
          alert(data.message); // TODO: Замінити на кращі сповіщення
        } else {
          alert(`Помилка: ${data.message || "Не вдалося видалити."}`);
        }
      } catch (error) {
        console.error("Fetch error:", error);
        alert("Сталася помилка мережі.");
      } finally {
        hideModal();
      }
    });

  // Делегування подій для всіх кнопок видалення
  document.body.addEventListener("click", (event) => {
    const deleteDocButton = event.target.closest(".delete-doc-btn");
    const deleteCollButton = event.target.closest(".delete-coll-btn");
    const deleteIndexButton = event.target.closest(".delete-index-btn");

    if (deleteDocButton) {
      event.preventDefault();
      const docId = deleteDocButton.dataset.id;
      const collName = deleteDocButton.dataset.collection;
      const url = `/db/${collName}/${docId}`;
      const element = deleteDocButton.closest("tr"); // Або інший батьківський елемент
      showModal(
        `Ви впевнені, що хочете видалити документ ${docId}?`,
        url,
        element
      );
    }

    if (deleteCollButton) {
      event.preventDefault();
      const collName = deleteCollButton.dataset.collection;
      const url = `/db/${collName}`;
      const element = deleteCollButton.closest(".collection-card");
      showModal(
        `УВАГА! Ви впевнені, що хочете видалити ВСЮ колекцію "${collName}"?`,
        url,
        element
      );
    }

    if (deleteIndexButton) {
      event.preventDefault();
      const collName = deleteIndexButton.dataset.collection;
      const indexName = deleteIndexButton.dataset.index;
      const url = `/db/${collName}/index/${indexName}`;
      const element = deleteIndexButton.closest("li");
      showModal(
        `Ви впевнені, що хочете видалити індекс "${indexName}"?`,
        url,
        element
      );
    }
  });

  // === Font Changer Logic (from settings.ejs) ===
  const fontSelect = document.getElementById("font-select");
  const body = document.body;
  // const fontStyleElement = document.getElementById('dynamic-font-style');

  if (fontSelect) {
    const applyFont = (fontFamily) => {
      body.style.fontFamily = fontFamily;
      localStorage.setItem("selectedFont", fontFamily);
      fontSelect.value = fontFamily;
    };

    const savedFont = localStorage.getItem("selectedFont");
    if (savedFont) {
      applyFont(savedFont);
    } else {
      fontSelect.value =
        window.getComputedStyle(body).fontFamily || "'Inter', sans-serif";
    }

    fontSelect.addEventListener("change", (e) => {
      applyFont(e.target.value);
    });
  }
}); // Кінець DOMContentLoaded
