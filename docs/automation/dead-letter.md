# Dead-letter

Стан `dead_letter` у `workflow-status` (стор `workflow-status`, keyed за
`workflowId`) — досягається, коли `reasonCode` не входить у RETRYABLE
(retry-policy.md) або вичерпано `MAX_RETRIES=5`.

## Що НЕ втрачається

Джерельна подія (`lead_submitted` тощо) лишається в `automation-events`
незалежно від того, скільки разів downstream-обробка провалилась —
dead-letter описує СТАН обробки, не сам факт наявності даних.

## Як побачити dead-letter записи

Цього циклу немає окремого "list all dead_letter" endpoint (не
будувався — вимагав би або authenticated list-по-всіх-workflowId, або
секондарний індекс; відкладено, щоб не додавати ще один недоперевірений
шар в кінці великого циклу). Практично: `getWorkflowStatus(workflowId)`
через authenticated `replay-workflow.js` (яке саме поверне поточний
статус) або прямий перегляд Blobs через Netlify dashboard (owner-дія).

## Replay

`docs/runbooks/replay-dead-letter.md`.
