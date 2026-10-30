export const chatCopy={
 uk:{required:"Напишіть запитання.",title:"Запитати про ці дані",intro:"Числа надходять зі збереженого звіту. AI пояснює їх, але не змінює ціни, замовлення чи календар.",
   topic:"Тема",topics:{overview:"Загальна картина",sales:"Продажі",stock:"Залишки",repricing:"Збережена уцінка",reordering:"Збережене дозамовлення"},
   question:"Ваше запитання",placeholder:"Наприклад: які показники потребують уваги?…",send:"Отримати пояснення",sending:"Пояснюю…",reset:"Нова розмова",retry:"Повторити перевірку",you:"Ваше запитання",answer:"Пояснення AI",facts:"Показники зі звіту",source:"Перевірити дані",sources:"Джерела пояснення",period:"Продажі за період",stockDate:"Дата залишків",partial:"Лише покрита частина",incomplete:"Неповні дані",unavailable:"Немає підтверджених даних",units:"од.",unknownCurrency:"Валюта не підтверджена",readOnly:"Для запиту пояснення потрібен доступ аналітика або адміністратора.",empty:"Оберіть тему й поставте запитання. Ціни й закупівлі залишаться без змін.",limit:"Ліміт цієї розмови досягнуто. Почніть нову, щоб поставити наступне запитання.",network:"Не вдалося перевірити відповідь. Повторна перевірка використає той самий запит.",changed:"Дані або фільтри змінилися. Оновіть звіт і почніть нову розмову.",scope:"Пояснення стосується вибраного періоду й фільтрів. Фільтр каналу застосовується до продажів; залишки є спільними.",warning:"Пояснення є рекомендацією. Точні значення й обмеження наведено в показниках і джерелах.",
   labels:{revenue:"Дохід",grossProfit:"Валовий прибуток",stockCost:"Залишок за собівартістю",stockUnits:"Кількість у залишку"},
   policy:"Пояснення AI ще не ввімкнено. Нижче наведено перевірені показники зі звіту.",budget:"Ліміт AI вичерпано. Показники зі звіту залишаються доступними.",provider:"Не отримали коректне пояснення AI. Нижче наведено показники зі звіту.",scenario:"Спочатку виберіть збережений експорт на сторінці уцінки або дозамовлення.",processing:"Попередній запит ще обробляється. Перевірте відповідь повторно.",narrow:"Звузьте валюту або обсяг запиту та спробуйте знову.",history:"Не вдалося підтвердити історію розмови. Почніть нову.",askScenario:"Пояснити цей сценарій"},
 en:{required:"Enter a question.",title:"Ask about this report",intro:"Numbers come from the saved report. AI explains them without changing prices, orders or the calendar.",
   topic:"Topic",topics:{overview:"Overview",sales:"Sales",stock:"Stock",repricing:"Saved repricing",reordering:"Saved reordering"},
   question:"Your question",placeholder:"For example: which metrics need attention?…",send:"Get explanation",sending:"Preparing explanation…",reset:"New conversation",retry:"Check again",you:"Your question",answer:"AI explanation",facts:"Report facts",source:"Verify data",sources:"Explanation sources",period:"Sales period",stockDate:"Stock date",partial:"Covered portion only",incomplete:"Partial data",unavailable:"No verified data",units:"units",unknownCurrency:"Currency unverified",readOnly:"An analyst or administrator role is required to request an explanation.",empty:"Choose a topic and ask a question. Prices and purchases will stay unchanged.",limit:"This conversation has reached its limit. Start a new one to ask another question.",network:"Could not confirm the response. Checking again will use the same request.",changed:"Data or filters changed. Refresh the report and start a new conversation.",scope:"Explanations use the selected period and filters. Channel filters apply to sales; stock is shared.",warning:"Explanations are recommendations. Exact values and limitations appear in report facts and sources.",
   labels:{revenue:"Revenue",grossProfit:"Gross profit",stockCost:"Stock at cost",stockUnits:"Stock quantity"},
   policy:"AI explanations are not enabled yet. Verified report facts appear below.",budget:"The AI limit has been reached. Report facts remain available.",provider:"No valid AI explanation was received. Report facts appear below.",scenario:"First select a saved export on the repricing or reordering page.",processing:"The previous request is still processing. Check the response again.",narrow:"Choose a currency or narrow the request and try again.",history:"The conversation history could not be verified. Start a new conversation.",askScenario:"Explain this scenario"}
};
export const citationCopy={
 uk:{current:"Вибраний період",priorYear:"Попередній рік",stock:"Залишки",scenario:"Збережений сценарій",metric:"Показник",fields:{revenue:"Дохід",coveredGrossProfit:"Покритий валовий прибуток",coveredRevenue:"Покритий дохід",stockCost:"Залишок за собівартістю",quantity:"Кількість",units:"Продано одиниць",orderCount:"Кількість замовлень",sum:"Сума",purchaseAmount:"Сума закупівлі"}},
 en:{current:"Selected period",priorYear:"Prior year",stock:"Stock",scenario:"Saved scenario",metric:"Metric",fields:{revenue:"Revenue",coveredGrossProfit:"Covered gross profit",coveredRevenue:"Covered revenue",stockCost:"Stock at cost",quantity:"Quantity",units:"Units sold",orderCount:"Order count",sum:"Amount",purchaseAmount:"Purchase amount"}}
};
export function chatNotice(code:string|undefined,copy:typeof chatCopy.uk|typeof chatCopy.en):string {
 if(!code)return copy.provider;
 if(code==="AI_CHAT_EMPTY_QUESTION")return copy.required;
 if(["AI_POLICY_REQUIRED","AI_CAPABILITY_NOT_ENABLED","AI_CONFIGURATION_ERROR"].includes(code))return copy.policy;
 if(code.includes("BUDGET_EXCEEDED"))return copy.budget;
 if(code==="AI_SCENARIO_REQUIRED")return copy.scenario;
 if(code.includes("CONTEXT")||code==="AI_RUN_NOT_ACTIVE")return copy.changed;
 if(code.includes("SCENARIO"))return copy.scenario;
 if(code.includes("HISTORY"))return copy.history;
 if(["AI_EXECUTION_IN_PROGRESS","AGENT_RUN_ALREADY_RUNNING"].includes(code))return copy.processing;
 if(["AI_INPUT_LIMIT","AI_CHAT_SCOPE_LIMIT"].includes(code))return copy.narrow;
 if(code==="AI_FORBIDDEN"||code==="FORBIDDEN")return copy.readOnly;
 return copy.provider;
}
