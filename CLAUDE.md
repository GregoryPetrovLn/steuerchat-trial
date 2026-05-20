# CLAUDE.md — Streaming Chat Prototype

## Описание проекта

Прототип стримингового чата для technical trial. NestJS + socket.io бэкенд стримит текст (~500 слов) со скоростью 5 слов/сек. Нативное SwiftUI iOS-приложение отображает слова по мере поступления. Ключевая фича — reconnect/resume после потери сети (airplane mode).

## Структура

```
backend/          NestJS + socket.io сервер (TypeScript)
ios/              SwiftUI iOS-приложение (Swift 5.9, iOS 17+)
scripts/          Интеграционный тест реконнекта (tsx)
```

## Стек и версии

- Node.js 20.x, NestJS 10.x, socket.io 4.7.5, TypeScript 5.7.3
- Swift 5.9+, iOS 17+, Xcode 15+, socket.io-client-swift 16.x (SPM)

## Команды

```bash
# Бэкенд
cd backend && npm install && npm run build && node dist/main.js   # запуск
cd backend && npm test                                             # юнит-тесты (13 штук)
cd backend && npm run start:dev                                    # dev-режим с watch

# Интеграционный тест (бэкенд должен быть запущен)
cd scripts && npm install && npx tsx test-reconnect.ts

# Сборка бэкенда
cd backend && npm run build
```

## Архитектура бэкенда

- `src/chat/chat.gateway.ts` — socket.io gateway, обработка событий (send-message, cancel, resume, disconnect)
- `src/chat/stream-session.ts` — стейт-машина сессии: STREAMING → BUFFERING → COMPLETED/CANCELLED
- `src/chat/session-manager.ts` — хранилище сессий (Map), GC с TTL (60с buffering, 30с completed)
- `src/chat/corpus.ts` — текст По (~508 слов), экспорт CORPUS и CORPUS_WORDS

## Протокол socket.io

| Событие | Направление | Payload |
|---------|-------------|---------|
| `send-message` | Client → Server | `{ messageId, text }` |
| `stream-chunk` | Server → Client | `{ messageId, word, index }` |
| `stream-end` | Server → Client | `{ messageId, totalWords }` |
| `cancel` | Client → Server | `{ messageId }` |
| `stream-cancelled` | Server → Client | `{ messageId, lastIndex }` |
| `resume` | Client → Server | `{ messageId, lastWordIndex }` |
| `catch-up` | Server → Client | `{ messageId, words: [{word, index}] }` |

## Ключевые решения

- **Идентификация сессии**: клиентский UUID (`messageId`), не socket.id (меняется при reconnect)
- **Поведение при disconnect**: сервер продолжает буферизацию (timer работает, слова в buffer). Не пауза — имитация LLM, мгновенный catch-up
- **Cancel ≠ disconnect**: cancel — явный, уничтожает сессию. Disconnect — транспортный, сохраняет сессию с TTL
- **Хранение**: in-memory Map, нет персистентности (серверный рестарт = потеря сессий)

## Правила для работы с кодом

- Код чистый, идиоматичный, объяснимый построчно — это для code review на интервью
- Никаких трюков, которые сложно защитить при объяснении
- `setInterval` 200мс для тика (просто, предсказуемо), не rxjs
- Бэкенд: строгие типы для всех payload'ов (`src/types.ts`)
- iOS: `@MainActor` на ViewModel, все callback'и на main queue
- Тесты: Jest для бэкенда, интеграционный скрипт на tsx для reconnect-сценария

## Тесты

- `backend/test/stream-session.spec.ts` — 7 тестов StreamSession (start, cancel, pause, resume, catch-up, TTL, completion)
- `backend/test/session-manager.spec.ts` — 6 тестов SessionManager (create, retrieve, remove, GC)
- `scripts/test-reconnect.ts` — интеграционный тест: reconnect (508 слов без пропусков) + cancel (стоп + новое сообщение)

## Документация

- `PLAN.md` — архитектура, протокол, стейт-машина (всё на русском)
- `WRITEUP.md` — технический разбор для ревьюеров (русский)
- `INTERVIEW_NOTES.md` — шпаргалка к интервью: ответы, follow-up, live-диффы (русский)
- `TESTING.md` — ручной тест-план с чеклистом (русский)
