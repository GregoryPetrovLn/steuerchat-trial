# StreamingChat — iOS

Нативное SwiftUI-приложение для чата, которое подключается к бэкенду через socket.io и отображает потоковые ответы в реальном времени. Поддерживает отмену посреди стрима и автоматическое переподключение с возобновлением.

## Требования

- Xcode 15 или новее
- Симулятор или физическое устройство с iOS 17.0+
- Запущенный бэкенд-сервер на `localhost:3000` (см. `../backend/`)

## Настройка

1. Откройте `StreamingChat.xcodeproj` в Xcode.
2. Xcode автоматически загрузит зависимость Swift Package Manager (`socket.io-client-swift`). Дождитесь завершения.
3. Выберите симулятор с iOS 17+ (например, iPhone 15) или физическое устройство.
4. Нажмите **Cmd+R** для сборки и запуска.

## Конфигурация

URL сервера задаётся в файле `StreamingChat/Networking/SocketService.swift`:

```swift
private static let serverURL = URL(string: "http://localhost:3000")!
```

Измените это значение, если бэкенд работает на другом хосте или порту.

### Запуск на физическом устройстве

Если вы запускаете приложение на реальном iPhone, а сервер работает на Mac:

1. Замените `localhost` на локальный IP-адрес вашего Mac (например, `http://192.168.1.42:3000`).
2. В приложении объявлен `NSLocalNetworkUsageDescription` в Info.plist — iOS запросит разрешение на доступ к локальной сети. Разрешите его.
3. Убедитесь, что Mac и iPhone подключены к одной Wi-Fi сети.

## Тестирование реконнекта

1. Запустите бэкенд-сервер и отправьте сообщение в приложении.
2. Пока ответ стримится, включите **Авиарежим** на устройстве (или отключите сеть симулятора через Network Link Conditioner).
3. Баннер подключения должен стать жёлтым («Reconnecting...»).
4. Включите сеть обратно. Приложение автоматически переподключится, запросит пропущенные данные с сервера и продолжит отображение стрима с того места, где остановилось.

## Архитектура

```
StreamingChat/
  StreamingChatApp.swift       Точка входа приложения
  Models/
    ChatMessage.swift          Модель данных сообщения
    ConnectionState.swift      Перечисление состояний подключения
  Networking/
    SocketService.swift        Обёртка над клиентом socket.io
  ViewModels/
    ChatViewModel.swift        Основное управление состоянием (ObservableObject)
  Views/
    ChatView.swift             Главный экран чата
    MessageBubble.swift        Пузырёк отдельного сообщения
    ConnectionBanner.swift     Индикатор состояния подключения
```

## Протокол

Приложение взаимодействует с бэкендом через следующие события socket.io:

| Событие | Направление | Данные |
|---------|-------------|--------|
| `send-message` | Клиент → Сервер | `{ messageId, text }` |
| `stream-chunk` | Сервер → Клиент | `{ messageId, word, index }` |
| `stream-end` | Сервер → Клиент | `{ messageId, totalWords }` |
| `cancel` | Клиент → Сервер | `{ messageId }` |
| `stream-cancelled` | Сервер → Клиент | `{ messageId, lastIndex }` |
| `resume` | Клиент → Сервер | `{ messageId, lastWordIndex }` |
| `catch-up` | Сервер → Клиент | `{ messageId, words: [{word, index}] }` |
| `error` | Сервер → Клиент | `{ messageId?, message }` |
