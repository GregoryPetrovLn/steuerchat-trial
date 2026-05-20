# Прототип стримингового чата

Система чата с потоковой передачей в реальном времени: бэкенд на NestJS стримит текст через socket.io со скоростью ~5 слов/сек; нативное iOS-приложение на SwiftUI отображает слова по мере поступления, поддерживает отмену посреди стрима и прозрачный реконнект с возобновлением.

## Стек технологий

| Компонент | Версия |
|-----------|--------|
| Node.js | 20.x LTS |
| NestJS | 10.x |
| socket.io | 4.7.x |
| TypeScript | 5.x |
| Swift | 5.9+ |
| iOS target | 17.0+ |
| Xcode | 15+ |
| socket.io-client-swift | 16.x (SPM) |

## Быстрый старт: бэкенд

```bash
cd backend
npm install
npm run start:dev
```

Сервер запускается на `http://localhost:3000`.

## Быстрый старт: iOS-приложение

1. Откройте `ios/StreamingChat.xcodeproj` в Xcode 15+.
2. Xcode автоматически подтянет SPM-зависимость `socket.io-client-swift`.
3. Выберите симулятор (iOS 17+) и нажмите **Cmd+R** для сборки и запуска.
4. Приложение подключается к `localhost:3000` при запуске.

## Запуск автотеста реконнекта

```bash
cd scripts
npm install
npx tsx test-reconnect.ts
```

## Структура проекта

```
steuerchat-trial/
├── PLAN.md                     # Архитектурный план и проектные решения
├── WRITEUP.md                  # Технический разбор для ревьюеров
├── TESTING.md                  # Ручной тест-план
├── backend/
│   ├── src/
│   │   ├── main.ts             # Точка входа, CORS, конфигурация порта
│   │   ├── app.module.ts       # Корневой модуль NestJS
│   │   ├── types.ts            # Общие типы/интерфейсы/перечисления
│   │   └── chat/
│   │       ├── chat.module.ts
│   │       ├── chat.gateway.ts     # Socket.io gateway: обработчики событий
│   │       ├── stream-session.ts   # Машина состояний StreamSession + буфер
│   │       ├── session-manager.ts  # Карта сессий + сборка мусора
│   │       └── corpus.ts           # ~500 слов текста (отрывок По)
│   └── test/
│       ├── stream-session.spec.ts
│       └── session-manager.spec.ts
├── ios/
│   ├── StreamingChat.xcodeproj/
│   └── StreamingChat/
│       ├── StreamingChatApp.swift
│       ├── Models/
│       │   ├── ChatMessage.swift
│       │   └── ConnectionState.swift
│       ├── Networking/
│       │   └── SocketService.swift
│       ├── ViewModels/
│       │   └── ChatViewModel.swift
│       └── Views/
│           ├── ChatView.swift
│           ├── MessageBubble.swift
│           └── ConnectionBanner.swift
└── scripts/
    ├── package.json
    └── tsconfig.json
```

## Документация

- **[WRITEUP.md](./WRITEUP.md)** -- Техническое описание архитектуры
- **[TESTING.md](./TESTING.md)** -- Ручной тест-план
- **[PLAN.md](./PLAN.md)** -- Архитектурный план и проектные решения
