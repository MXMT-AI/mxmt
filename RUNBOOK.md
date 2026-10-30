# MXMT Analytics — Production Runbook

Операційна інструкція для поточної версії MVP та оновленого toolchain. Оновлено **30 жовтня 2026 року**. Описує процедури; не засвідчує, що live-доступи, cron, UAT або rollout уже перевірені.

Для локального встановлення й env inventory використовуйте [README](README.md), для дій користувача — [INSTRUCTIONS](INSTRUCTIONS.md). Детальні контракти зберігаються в tracked `prisma/verification/`.

## 1. Topology і межі повноважень

| Компонент | Source of truth / операційна поверхня |
| --- | --- |
| Код | GitHub branch / exact commit; production Git integration зазвичай `main` |
| Application та API | Vercel deployment; Next.js 16, Node 24, `proxy.ts` |
| Runtime config | Environment відповідного Vercel deployment |
| БД | Neon PostgreSQL branch/database/schema; pooled runtime, direct CLI |
| Schema | `prisma/schema.prisma`, `prisma/migrations`, Prisma 7 config |
| Remote sync | Trusted external minute worker → `/api/cron/salesdrive-sync`; durable jobs у БД |
| Daily Sheets pipeline | Два daily Vercel Cron slots у `vercel.json` |
| Дані клієнта | Обране tenant/source, raw imports, затверджені mappings, версійовані settings |
| AI | Provider keys + окремі approved/enabled v2 budgets; старі agents мають свій workflow |

Назва SalesDrive збережена в сумісних worker routes/scripts, хоча runtime підтримує також KeyCRM, Horoshop і Shopify. Google Sheets має native projection path, CSV — offline upload path. Реальна наявність worker/relay перевіряється оператором, не випливає з мерджу коду.

Цей runbook не є дозволом на production migration, restore, secret rotation, зміну джерела або зовнішній запис. Перед такими діями зафіксуйте точний environment/tenant/source/branch і погоджений обсяг. Не застосовуйте Railway deployment commands до поточної Vercel/Neon topology.

## 2. Toolchain і доступи

Використовуйте `.nvmrc` та `package-lock.json`: Node 24.22.2 локально, npm 11.19.1, Prisma CLI/Client/adapter 7.10.1. Не запускайте випадковий latest CLI або Prisma 5 за старою інструкцією в історичному документі.

Потрібні GitHub, Vercel, Neon та мінімальні права на обране джерело. Для provider incident потрібен доступ до відповідної console. Не копіюйте customer rows, payloads, credentials або prompts у публічні logs/tickets.

Критичні secrets:

- `DATABASE_URL` / `DIRECT_URL` — той самий target; Neon pooled/direct для public, TLS; custom schema потребує явного direct runtime URL.
- Незалежні `JWT_ACCESS_SECRET` і `JWT_REFRESH_SECRET`; rotation потребує повторного входу користувачів.
- `CONNECTOR_ENCRYPTION_KEY` — стабільні 32 байти в base64. Під час rotation потрібне кероване переведення існуючого ciphertext; проста заміна value не дешифрує старі credentials.
- `CRON_SECRET` — Bearer для scheduled/worker requests. `SALESDRIVE_WEBHOOK_SECRET` — окремий relay secret, не той самий token.
- Google Service Account / provider credentials / AI keys — лише у відповідних secret/config surfaces. CRM keys вводить ADMIN через Settings; не додавайте їх у URL.
- Для Horoshop `HOROSHOP_ALLOWED_ORIGINS` містить точні перевірені HTTPS origins, без wildcard.

Повний inventory — [README configuration](README.md#конфігурація-і-секрети), [`.env.example`](.env.example). Зміна Vercel env потребує нового deployment. Preview має використовувати окрему migrated branch та тестові credentials.

## 3. Щоденний operational check

1. Перевірте exact production deployment SHA та `GET /api/health`.
2. У Settings перевірте **обране джерело MVP**, revision, readiness, останній успішний import і stock observation. Підключення та вкладка Data & Reports самі по собі не вибирають джерело.
3. Для remote provider перевірте heartbeat external worker, watermark lag, baseline/backfill, queued/retry/paused jobs, 429/budget блокування та останній завершений cycle.
4. Для Sheets перевірте останній raw import, approved mapping і окремо MVP projection. Daily raw import/legacy calculation не дорівнює свіжому MVP snapshot.
5. Перевірте recalculation queue: прийнятий import ще не є завершеним financial/daily результатом.
6. На всіх п’яти екранах звірте період, валюту, джерело, timestamps, coverage та source-change попередження.
7. У Settings Data Quality перегляньте поточні diagnostics і окремо import-warning history. Групи issues перетинаються: не сумуйте їх як незалежну вартість проблемного стоку.
8. У Runtime Logs зіставте 5xx з route, requestId, source/run і duration; не робіть повторні мутації навмання.

### Health не є повним прийманням MVP

`GET /api/health` перевіряє `SELECT 1` і наявні data-health правила.

| Результат | Значення / дія |
| --- | --- |
| HTTP 200, `healthy` | Application/DB відповідають; це не доказ повної історії або правильності всіх формул |
| HTTP 200, `degraded` | Переглянути `checks.data.issues`: negative quantities/sales, stale Drive/AgentRun, catalog count mismatch |
| HTTP 503, `unhealthy` | Зіставити requestId з logs, DB target, TLS, compute і connections |

Публічний health endpoint не замінює tenant-specific Data Quality, connector queue, AI usage та UAT. Перед поширенням response перевірте його на внутрішні деталі.

## 4. Release і Vercel build

### Перед release

```sh
nvm use
npm ci
npx prisma validate
npx tsc --noEmit --incremental false
npm test -- --maxWorkers=2
npm run test:mvp
npm run build
npm audit
git diff --check
```

Для database-dependent rehearsal задайте обидва URL **ізольованої migrated БД**, потім:

```sh
npm run db:check
npm run build:vercel
```

Звичайний `build` не перевіряє migration readiness. `build:vercel` перевіряє target/status до генерації Client і збірки; не застосовує pending migrations. `dev` і `start` також мають pre-hooks перевірки readiness. Не прибирайте їх, щоб приховати P2022 або pending schema.

На laptop не допускайте системного сну під час тривалих SQL/volume перевірок. При timeout збережіть невдалий результат, перевірте середовище й повторіть незмінний набір; не збільшуйте ліміти або skips без розслідування. Dependency-upgrade [звіт](prisma/verification/dependency-upgrade/report.md) містить приклад такого environmental збою та успішного повтору.

### Порядок deployment

1. Зафіксуйте release SHA/lock hash, environments, цільову Neon branch, schema history, активні джерела та rollback artifact.
2. Перевірте [MVP acceptance gates](prisma/verification/51-mvp-acceptance-rollout.md). Відкриті customer gates потребують owner go/no-go, а не формального PASS на підставі unit-тестів.
3. Призупиніть старі external workers/relay writers окремо від daily Vercel Cron, якщо rollout змінює queue/runtime contract. Збережіть checkpoints і raw evidence.
4. Для schema changes підготуйте restore point, проведіть rehearsal на копії з реальними volumes, порівняйте counts/суми й backward compatibility.
5. Окремо застосуйте погоджені additive migrations на точному target. Перевірте `db:check`.
6. Розгорніть exact commit через Git/погоджений Vercel workflow. Repository Build Command — **`npm run build:vercel`**; звірте project override.
7. Перевірте Node **24.x** у build і function runtime, environment та SHA. Vercel може використовувати інший patch, ніж локальна `.nvmrc` ([runtime docs](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)).
8. Виконайте smoke нижче. Відновіть лише погоджені workers/relay/crons, проведіть canary та моніторинг черги.
9. Зафіксуйте deployment ID, schema/config/selection versions, smoke результати й owner рішення.

Під час dependency upgrade schema diff порожній; оновлення Prisma само по собі не вимагає нової міграції. Наявні pending migrations від попередніх MVP-функцій усе одно мають бути застосовані окремо. Build settings/env у репозиторії не є доказом фактичного production runtime.

## 5. Prisma 7 і migration recovery

CLI читає `DIRECT_URL` у `prisma.config.ts`, runtime використовує `PrismaPg` і `DATABASE_URL` у `lib/prisma.ts`. Обидва URL мають однакові branch/database/schema; lifecycle check нормалізує Neon `-pooler` і відхиляє mismatch без друку credentials.

```sh
npx prisma migrate status
npm run db:migrate:deploy
npm run db:check
```

`db:migrate:deploy` вище — **write action**, лише після target/rehearsal approval. `migrate status` / `db:check` не виконують DDL. У production не використовуйте `db push`, `migrate reset`, ручне додавання однієї відсутньої колонки або редагування вже застосованого SQL.

### Custom schema і transaction pooling

Neon не гарантує session search_path між транзакціями ([pooling limitations](https://neon.com/docs/connect/connection-pooling)). У цій версії custom schemas підтримуються лише з direct runtime; pooled custom schema є явно непідтриманою конфігурацією. Lifecycle і runtime використовують одну policy та зупиняються до читання/запису application data.

Не виконуйте `ALTER ROLE`, не прибирайте guard і не перемикайте production URL як випадковий workaround. Якщо потрібен custom schema, підготуйте direct runtime/migration target у staging, перевірте pool/compute capacity та розгорніть погоджену конфігурацію. Підтримка custom schema через transaction pooler потребує окремої schema-qualified raw SQL стратегії; цей patch не заявляє таку підтримку.

### P2022 / `Sku.catalogAttributes` відсутня

1. Зіставте SHA з повною migration history цільової БД.
2. Перевірте, що local `.env.local` або Vercel environment не вказують на іншу branch.
3. Rehearse backlog на копії; перевірте legacy counts/totals і нові application reads.
4. Після погодженого apply перезапустіть локальний процес або redeploy matching code.
5. Якщо history каже up-to-date, дослідіть ручний drift. `prisma generate` змінює Client, а не БД.

### Failed migration

Зупиніть повторні спроби, збережіть migration name, SQL error, logs і фактичний стан DDL/data. Не позначайте успішну міграцію rolled-back. `prisma migrate resolve` доречний лише після перевірки, що конкретний failed migration був відкочений або завершений відповідно до recovery plan. Після використання нових моделей віддавайте перевагу forward fix; emergency pre-use rollback SQL не є загальним down migration.

Для rename/drop застосовуйте expand → compatible code → verified backfill → switch → separate contract migration. Зберігайте SQL CHECK/partial indexes/triggers, яких Prisma schema не відображає повністю. Деталі — [модель/rollback](prisma/verification/README.md), [startup lifecycle](prisma/verification/database-schema-startup.md), [Prisma 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7).

### Connection incident

Перевірте direct/pooled target, TLS, актуальний deployment env, Neon compute, connections і довгі транзакції. Runtime pool має окремі `connect_timeout` (default 5s) і `pool_timeout` (default 10s). Pool checkout deadline включає також отримання нового connection; нуль вимикає лише відповідний deadline. `schema` задає ORM qualification; session search_path для raw SQL застосовується лише на direct runtime. Neon `-pooler` і `pgbouncer=true` не виконують session SET. Custom schema з transaction pooler блокується до network/CLI; потрібен явно обраний direct `DATABASE_URL` тієї самої БД/schema й переглянутий connection budget. Автоматичного bypass через `DIRECT_URL` або зміни role defaults немає. Public pooled runtime потребує стандартного public role search_path; інші transaction poolers позначайте `pgbouncer=true`. Pool options мають явний `max`; не вимикайте TLS, не перемикайтеся на випадкову branch і не змінюйте limits без аналізу навантаження. Не використовуйте синтетичний local probe як доказ production capacity.

## 6. Три незалежні шляхи імпорту

### Google Sheets

Для нового джерела потрібні raw import, approved mapping, explicit selection і projection. ADMIN виконує їх у Settings / Data & Reports. Mappings прив’язані до import/schema/hash, тому після змін джерела старе approval може стати непридатним.

Data & Reports Import виконує незалежні кроки: raw save → MVP projection для вибраного Sheets → legacy tab calculation. Частковий успіх зберігається й пояснюється окремо; не повторюйте весь import, якщо потрібне лише відновлення projection. **Refresh MVP reports** працює зі збереженим import; не завантажує файл і не рахує legacy tabs. Нові snapshots п’яти екранів використовують shared engines.

Ліміти: workbook 15 MiB / 100 000 сумарних raw rows; projection має bounded preparation і 45-second publication transaction / 60-second route. Необроблені/конфліктні order identities quarantined, а не здогадуються. Не вигадуйте дати повернення, historical stock, ownership або transit.

Daily Vercel Cron:

| Route | UTC schedule |
| --- | --- |
| `/api/cron/data-import/utc-04` | `0 4 * * *` |
| `/api/cron/data-import/utc-05` | `0 5 * * *` |

Local Kyiv gate пропускає невідповідний DST slot. На Hobby час виклику має годинну точність; це вікно, не точна 07:00 ([Vercel limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)). Перед cron потрібен створений tenant Sheets source. Цей scheduler виконує існуючий raw/legacy pipeline; **автоматичною MVP-проєкцією він не є**.

Погоджений операторський forced run:

```sh
curl --fail --request POST \
  --header "Authorization: Bearer $CRON_SECRET" \
  "https://your-app.example/api/cron/data-import?force=1"
```

Це import write, не read-only health check. `force=1` обходить тільки time gate. Перевірте target, retries/idempotency, per-tenant results і raw/legacy/MVP outcomes окремо. Не робіть public workbook доступним без погодженого data-access рішення; для приватного джерела використовуйте Service Account.

### Remote connectors і external worker

На погодженому Hobby-плані minute worker зовнішній; minute expression у `vercel.json` не додається. Trusted host з Node 24 отримує тільки потрібні secrets:

```sh
node scripts/salesdrive-sync-worker.mjs --help
# SALESDRIVE_SYNC_ORIGIN і CRON_SECRET вже задані в secret environment host.
node scripts/salesdrive-sync-worker.mjs --once
# Або довготривалий sequential runner:
node scripts/salesdrive-sync-worker.mjs
```

Origin — plain HTTPS, secret — у header, не query string. Runner не слідує redirects і не перекриває ticks. Він викликає `/api/cron/salesdrive-sync`; один tick обмежено dispatch/page/recalculation work, не повний backfill.

Orders intents створюються за двогодинними UTC slots, stock intent — за Kyiv date після 03:00. Це політика планування; фактична затримка залежить від queue/provider budgets. Історія/receipts можуть бути неповними, а поточний feed не відновлює минулі stock observations.

Manual `refresh`, `step`, `resume`, `resumeBackfill` доступні ADMIN через shared connector controls; VIEWER читає progress. На 429 дотримуйтеся account-wide budget/Retry-After. Не запускайте нескінченний цикл ручних retries і не стирайте checkpoints, щоб зняти блокування.

Jobs мають source lease, revision fencing, durable continuations і atomic publication. `PENDING` import run між сторінками не означає втрату progress. `WAITING_ENGINE` recalculation означає очікування роботи/доказів, а не відсутність реалізованих engines: daily, sales і classification уже реалізовані. Перевірте input provenance, active source і фазу, перш ніж повторювати.

### Webhook relay

`POST /api/webhooks/salesdrive/<sourceId>` приймає лише trusted relay із source-scoped bearer. Native CRM signature/header capabilities не припускаються. Relay має сам перевіряти походження, зберігати й повторювати delivery. Receiver зберігає intent до `202`, deduplicates і планує verified API refetch. `503` потребує retry relay, не фальшивого success.

### CSV

Settings upload → explicit mapping → preview → activation → bounded job processing. Credentials зовнішнього API не потрібні, але metadata storage використовує connector encryption key. Polling відсутній; worker не має завантажувати remote CSV URL. Complete/partial population і history coverage декларуються окремо; відсутній рядок не стає нульовим stock. Recovery зберігає version/upload identity та audit, не редагує прийняті байти.

## 7. Симптоми й recovery

| Симптом | Перевірити | Наступна дія |
| --- | --- | --- |
| П’ять екранів порожні | Source readiness, mapping, projection, calculation, правильний період | Відкрити відповідну recovery destination; Retry не імпортує джерело |
| Raw таблиця є, MVP немає | Чи вибране Sheets, чи погоджений mapping, чи завершено projection | ADMIN Refresh MVP, потім перевірити queue/snapshot |
| `SOURCE_CHANGED` / stale preview | Selection revision, import hash, settings, snapshot/input-set | Створити новий snapshot/preview; не перевикористовувати старий сценарій як поточний |
| Import `FAILED` | Run/error code, exact source, page/lease і quarantined rows | Виправити причину та відновити штатним resume; попередня успішна публікація не видаляється |
| Import `WARNING` | Issues code/count/provenance, current Data Quality окремо від history | Узгодити correction, re-import/reproject потрібний scope, звірити результат |
| History / GP / valuation unavailable | Датовані observations, costs, ownership, supplier terms, coverage | Доповнити підтверджені докази; не заповнювати нулями |
| 429 / paused job | Budget, Retry-After, account check, credentials/mapping revision | Зберегти checkpoint, усунути конфігураційну причину; resume після дозволеного часу |
| Auth redirect loop / 401 | Proxy, signed cookies, JWT env, refresh/revocation, DB membership | Відтворити login/refresh/logout без токенів у logs; сумісний rollback за потреби |
| AI policy/budget failure | Capability policy, enabled period, limits, credentials, context fingerprint | Missing policy не bypass-ити; створити новий budgeted request лише після виправлення |
| Export conflict / 409 | Preview identity, actor, request UUID, source/config revision | Невизначений export retry — той самий UUID та intent; змінився сценарій — новий preview |
| External action UNKNOWN | Stored attempt, exact approved export, access policy | Не відправляти повторно; explicit reconciliation за контрактом |

Свіжість і completeness — різні показники. Нещодавній Sheets import може бути fresh і водночас мати непідтверджену історію. Stock history UI має бути provider-neutral; лише реальні observations, без обіцянки появи історії через певну кількість днів.

## 8. CSV, AI та зовнішні дії

Repricing/Reordering export має UTF-8 BOM, `;`, CRLF, CSV escaping і захист текстових formula prefixes. Журнал фіксує **створення файлу**, а не його завантаження на диск, зміну ціни, відправлення чи виконання промо. Exact replay повертає збережені байти; не генеруйте receipt заново з поточних даних.

v2 AI потребує окремо створеного disabled budget period і явного enable у trusted admin context. Публічного provisioning endpoint/default paid policy немає. Usage резервується перед кожною спробою; зміна source/settings invalidates context, але не скасовує вже incurred usage. Legacy agents не мігрують у цей budget автоматично. GPT-4o/model access та якість відповідей оцінюються окремо; SDK upgrade не є дозволом змінити модель.

**Live price write-back і supplier delivery вимкнені:** production routes не мають live transport/access policy. Price flow — ADMIN preview → approve → execute, до 20 цін, 15 хвилин approval. Supplier flow — одна перевірена supplier/currency group, окремий preview → approve → send, 15 хвилин approval; cancellation — окреме погодження. Timeout не дозволяє автоматично повторити write/send. Не підключайте transport як аварійний workaround без provider/account contract і canary.

Retrospective evidence не виконує зовнішню дію: ADMIN підтверджує exact exported subset із reference. SENT, ACCEPTED і RECEIVED — різні події. GMROI використовує saved GP з returns / середню вартість щоденних own-stock observations за той самий період; однакові повні before/after вікна без дня запуску, без annualization та causal uplift. Missing evidence / zero denominator → unavailable.

## 9. Smoke та customer acceptance

Виконуйте на staging з погодженими даними й signed test sessions; production canary потребує окремого обсягу. Сам перегляд не має запускати source activation, expensive AI або external writes.

1. Health, `/login`, login, refresh і logout. Після входу поточний маршрут `/dashboard`; відкрийте `/overview` через меню.
2. VIEWER бачить дозволені reports/history, але не може змінити джерело, approve mapping, імпортувати, export/download або виконати external action.
3. ADMIN у Settings читає всі три tabs, source/connection/progress/Data Quality; secrets не повертаються.
4. Пройдіть `/overview`, `/sales`, `/stock`, `/repricing`, `/reordering`: loading/empty/error/success, мова, тема, mobile, keyboard focus.
5. На реальних дозволених входах звірте KPI → detail на тому самому snapshot, валюті, датах і SKU population. Channel впливає на sales, а не shared stock.
6. Перевірте partial GP, missing LY/history/transit, classifications і source-switch invalidation; невідомі дані не створюють неправдивих нулів.
7. На staging побудуйте preview, перевірте exact repricing CSV та supplier/currency reorder CSV, історію і idempotent retry. Не тестуйте реальний CRM write/order send як частину звичайного smoke.
8. Перевірте два tenants, foreign IDs і ролі. Synthetic fixture success не є UAT.
9. За дозволеного sync canary перевірте реальну observation/watermark, bounded retry, queue completion та новий snapshot; daily Sheets і MVP projection — окремо.
10. Зафіксуйте release/config/calculation IDs і результати в [acceptance checklist](prisma/verification/51-mvp-acceptance-rollout.md).

Zavod benchmark/threshold sign-off, Sasha/Olia UAT, Bimba live onboarding та production operational evidence не підтверджуються мерджем PR або unit-тестами. Погодження загальних правил у чаті не замінює approval конкретного mapping чи actual benchmark package.

Офлайн-пакет без активації:

```sh
npm run audit:zavod -- /private/workbook.xlsx --out /private/audit.json
npm run reconcile:zavod -- /private/manifest.json --out /private/reconciliation.json
npm run verify:reporting:offline -- /private/workbook.xlsx /private/offline.json
```

Audit навмисно повертає exit 2 із review-required evidence; reconciliation може повернути exit 2/BLOCKED через відсутні inputs/approvals. Не переписуйте report на PASS. Порівнюйте один frozen workbook/hash, а не два завантаження динамічної таблиці. Зберігайте restricted artifacts поза Git.

## 10. Backup, restore і rollback

Перед ризиковою операцією зафіксуйте Neon project/branch, direct target, UTC/Kyiv timestamp, restore window/expiry, exact SHA і відповідального. Перевірте доступний механізм recovery на своєму плані; не припускайте retention, що не підтверджена в console.

1. Призупиніть відповідні writers: external worker, webhook relay і Vercel crons незалежно; не губіть queued jobs/checkpoints.
2. Створіть ізольовану point-in-time/backup branch та спочатку перевірте дані там. Для logical export використовуйте захищене сховище; dump не потрапляє в Git.
3. Зіставте schema history, tenants/users, raw imports, normalized orders/receipts, stock/price history, config approvals, screen/calculation IDs, exports/actions та AI usage ledger.
4. Rehearse matching code та smoke на копії. Restore production виконується лише після окремого target/point-in-time approval.
5. Перевірте TLS, pooled/direct URLs, health і tenant isolation. Відновіть writers контрольовано та перевірте replay/idempotency.

Application rollback у Vercel **не** відновлює БД, source selection, cron config або зроблені зовнішні дії. Перед rollback перевірте сумісність старого artifact із поточною schema, queue continuation та encryption envelopes. Для additive schema переважно залишити дані й відкотити code; для несумісного старого worker потрібен pause і forward fix. Dependency block відкочується разом із adapter/config/package/lock змінами та відповідним Node runtime, а не випадковим downgrade одного пакета.

Невизначений external write/send не виправляється database restore або blind resend. Збережіть attempt evidence й виконайте передбачену reconciliation/compensating-action процедуру.

## 11. Read-only діагностика БД

Тільки захищений SQL client на перевіреному target. Замініть placeholders на авторизований tenant/source; ці запити не змінюють дані. Не виводьте payloads, encryption envelopes або customer rows у tickets.

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM "_prisma_migrations" ORDER BY started_at DESC;

SELECT id, "sourceId", status, "startedAt", "completedAt"
FROM "DataImportRun"
WHERE "tenantId" = '<tenant-id>' ORDER BY "createdAt" DESC LIMIT 20;

SELECT id, "sourceId", resource, mode, state, attempts,
       "availableAt", "leaseExpiresAt", "errorCode", "updatedAt"
FROM "ConnectorSyncJob"
WHERE "tenantId" = '<tenant-id>' AND "sourceId" = '<source-id>'
ORDER BY "createdAt" DESC LIMIT 20;

SELECT "importRunId", "sourceId", state, "requestedAt"
FROM "ConnectorRecalculation"
WHERE "tenantId" = '<tenant-id>' AND "sourceId" = '<source-id>'
ORDER BY "requestedAt" DESC LIMIT 20;

SELECT id, "configType", key, revision, "isActive", "approvedAt"
FROM "MerchandisingConfig"
WHERE "tenantId" = '<tenant-id>' ORDER BY "createdAt" DESC LIMIT 20;
```

Не виправляйте lease/state/config через довільний UPDATE. Використовуйте штатні revision/role/fencing-aware recovery APIs або окремий reviewed repair plan.

## 12. Incident record і документи

Зафіксуйте severity, user impact, UTC/Kyiv час, tenant/source, deployment SHA/ID, Neon target, migration/config/selection revision, import/job/cycle/calculation/snapshot/export IDs, requestId, mitigation, recovery, результат і follow-up owner. Без secrets, raw prompts і customer payloads.

Ключові деталізації: [automatic sync](prisma/verification/32-automatic-sync.md), [provider foundation](prisma/verification/81-connector-foundation.md), [Sheets projection](prisma/verification/google-sheets-reporting-step-3.md), [Data Quality](prisma/verification/49-settings-data-quality.md), [scenario exports](prisma/verification/48-scenario-csv-exports.md), [AI budgets](prisma/verification/93-ai-execution-context-budgets.md), [write-back](prisma/verification/109-salesdrive-price-writeback.md), [supplier delivery](prisma/verification/110-supplier-order-delivery.md).
