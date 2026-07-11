// UX-INTERACTION FIX: єдине джерело даних для product-detail панелей.
// Контент узятий з реальних файлів Starter/Pro (структура аркушів xlsx,
// заголовки docx) — нічого не вигадано. Чекліст сюди не входить: його
// єдина CTA ("Отримати чекліст" -> #lead-form) вже коректна й не потребує
// окремої деталь-панелі.
window.ANTIHAOS_PRODUCTS = {
  matrix: {
    title: "Матриця цифрового продукту",
    audience: "Той, хто ще не сформулював чіткий офер — ідея є, але незрозуміло, що саме продавати, кому і за яким результатом.",
    contents: [
      "Setup — вхідні параметри проєкту",
      "Product Matrix — сам продукт: формат, склад, результат",
      "ICP Segments — хто купує і з яким болем",
      "Offer Packages — Starter / Pro / VIP в одній таблиці",
      "Pricing Model, Compliance Check, Launch Risks, Action Plan",
      "Dashboard — зведення по всіх аркушах"
    ],
    usageSteps: [
      "Заповнюєш Setup — базові вхідні дані проєкту",
      "Переносиш продукт, ICP і офер у Product Matrix",
      "Звіряєш пакети в Offer Packages",
      "Дивишся підсумок на Dashboard"
    ],
    result: "Продукт, ICP, пакети й офер зведені в одну структуру — конкретний офер замість розмитої ідеї.",
    packageId: "starter",
    packageLabel: "Starter — 1490 грн",
    packageHref: "/starter"
  },
  calculator: {
    title: "Калькулятор ціни та маржі",
    audience: "Той, хто ще не рахував ціну — призначив її на око або скопіював у конкурента.",
    contents: [
      "Assumptions — вхідні припущення (ціна, CAC, конверсія)",
      "Unit Economics — ціна, маржа, CAC на один продаж",
      "Pricing Simulator — кілька варіантів ціни",
      "12M Forecast — прогноз на 12 місяців",
      "Sensitivity — чутливість Pro-пакета до змін",
      "Recommendations і Dashboard"
    ],
    usageSteps: [
      "Вносиш ціну, CAC і конверсію в Assumptions",
      "Дивишся реальну маржу в Unit Economics",
      "Пробуєш варіанти ціни в Pricing Simulator",
      "Перевіряєш прогноз на 12 місяців"
    ],
    result: "Бачиш реальну маржу після комісій, реклами, податків і підтримки — а не здогадку.",
    packageId: "starter",
    packageLabel: "Starter — 1490 грн",
    packageHref: "/starter"
  },
  plan14: {
    title: "14-денний план запуску",
    audience: "Той, хто продукт уже підготував, але не знає, з чого почати і в якому порядку.",
    contents: [
      "Launch Plan — 14-денний план по днях",
      "Daily Checklist — щоденний список дій",
      "Gantt — візуальна карта запуску",
      "Risks & Decisions — ризики і рішення по ходу",
      "Content & Assets — які матеріали потрібні",
      "Data & Metrics і Dashboard"
    ],
    usageSteps: [
      "Дивишся Gantt-карту — загальний маршрут на 14 днів",
      "Щодня відмічаєш пункти в Daily Checklist",
      "Фіксуєш ризики й рішення по ходу запуску",
      "Слідкуєш за метриками в Data & Metrics"
    ],
    result: "Покроковий маршрут на 14 днів замість хаотичного списку задач.",
    packageId: "starter",
    packageLabel: "Starter — 1490 грн",
    packageHref: "/starter"
  },
  prodocs: {
    title: "Pro-документи",
    audience: "Той, хто готовий продавати, але оферта, політики й оплата ще не зібрані в систему.",
    contents: [
      "Публічна оферта — умови продажу цифрового продукту",
      "Privacy policy — персональні дані, email, Telegram, аналітика",
      "Refund policy — правила повернення і обмеження доступу",
      "Чекліст оплати / ПРРО / автовидачі",
      "Інструкція email + Telegram-прогрів"
    ],
    usageSteps: [
      "Адаптуєш оферту й політики під свій продукт",
      "Звіряєш чекліст оплати й ПРРО",
      "Підключаєш email/Telegram-прогрів за інструкцією"
    ],
    result: "Готова структура для прийому оплат — замість розрізнених документів або їх відсутності.",
    legalNote: "Перед прийманням реальних оплат — узгодь формулювання оферти, privacy і refund з юристом і бухгалтером (ПРРО, податки).",
    packageId: "pro",
    packageLabel: "Pro — 4900 грн",
    packageHref: "/pro"
  }
};
