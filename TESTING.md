# Manual Test Plan -- Streaming Chat Prototype

Use this checklist when testing the streaming chat prototype. Each section describes a scenario, the steps to reproduce, and the expected results.

---

## 1. Basic Streaming

**Goal:** Verify that sending a message produces a word-by-word streamed response at approximately 5 words per second, completing with the full corpus text.

- [ ] Open the app and confirm connection state shows "connected"
- [ ] Type "Hello" and tap send
- [ ] Observe words appearing one at a time in the response bubble
- [ ] Confirm the rate is approximately 5 words per second (each word ~200ms apart)
- [ ] Wait for the stream to finish (roughly 100 seconds for ~500 words)
- [ ] Confirm no error banners appeared during streaming
- [ ] Confirm the final text is the complete Poe excerpt ("True! nervous very very dreadfully nervous...")

---

## 2. Cancel Mid-Stream

**Goal:** Verify that cancelling a stream stops the response immediately, shows what was received so far, and allows sending a new message.

- [ ] Send a message and wait for approximately 20-30 words to appear
- [ ] Tap the cancel/stop button
- [ ] Confirm the response stops immediately (no new words appear)
- [ ] Confirm the partial text remains visible (not cleared)
- [ ] Confirm the input field is re-enabled for a new message
- [ ] Send a new message
- [ ] Confirm the new stream starts and words appear normally

---

## 3. Airplane Mode Reconnect (Key Scenario)

**Goal:** Verify that toggling airplane mode mid-stream causes the app to reconnect and resume without losing any words.

### Steps

- [ ] Send a message and wait for approximately 10-15 words to appear
- [ ] Toggle airplane mode ON (or disable Wi-Fi)
- [ ] Observe the connection banner changes to "reconnecting" or "offline"
- [ ] Wait 5 seconds
- [ ] Toggle airplane mode OFF (or re-enable Wi-Fi)
- [ ] Observe the connection banner returns to "connected"

### Expected Results

- [ ] After reconnection, missed words appear quickly (catch-up batch)
- [ ] Stream continues at normal pace (~5 wps) after catch-up
- [ ] The final complete text matches the full corpus with no gaps
- [ ] No duplicate words in the response
- [ ] Word order is correct throughout

---

## 4. Multiple Sequential Messages

**Goal:** Verify that after one stream completes, another can be started successfully.

- [ ] Send a message and wait for the stream to complete fully
- [ ] Confirm "stream completed" state (no more words arriving)
- [ ] Send a second message
- [ ] Confirm the second stream starts and produces words normally
- [ ] Wait for the second stream to complete
- [ ] Both responses should show the complete corpus text

---

## 5. Cancel Then New Message

**Goal:** Verify the cancel-then-send flow works cleanly.

- [ ] Send a message, wait for ~10 words
- [ ] Cancel the stream
- [ ] Immediately send a new message
- [ ] Confirm the new stream starts without errors
- [ ] Confirm no leftover words from the cancelled stream appear
- [ ] Wait for the new stream to complete normally

---

## 6. Connection State Indicators

**Goal:** Verify the connection banner/indicator shows the correct state at each point.

| Scenario | Expected State |
|----------|---------------|
| App opens, server is running | "Connected" (green) |
| Server is stopped before app opens | "Failed" or "Offline" (red) |
| Airplane mode toggled ON mid-stream | "Reconnecting" then "Offline" |
| Airplane mode toggled OFF | "Reconnecting" then "Connected" |
| Server killed while app is connected | "Reconnecting" then "Offline" |
| Server restarted after kill | "Connected" (after auto-reconnect) |

- [ ] Verify each state transition above
- [ ] Confirm the banner is visible only when NOT connected (or always visible with correct color)

---

## 7. Edge Cases

### 7a. Empty Message

- [ ] Send an empty message (no text)
- [ ] Confirm the server still starts a stream (the corpus is fixed, not dependent on input text)
- [ ] OR confirm the client prevents sending empty messages (depending on UI validation)

### 7b. Rapid Send Attempts

- [ ] Tap send multiple times quickly with different text
- [ ] Confirm only one stream is active at a time
- [ ] Confirm no error crashes or duplicate streams

### 7c. Disconnect at Stream Start

- [ ] Send a message
- [ ] Toggle airplane mode ON within 1 second (before many words arrive)
- [ ] Wait 5 seconds, toggle airplane mode OFF
- [ ] Confirm catch-up delivers all missed words
- [ ] Confirm stream continues and completes normally

### 7d. Disconnect Near Stream End

- [ ] Send a message and wait until approximately 90% of words have arrived (~450 out of 500)
- [ ] Toggle airplane mode ON
- [ ] Wait 5 seconds, toggle airplane mode OFF
- [ ] Confirm the remaining words arrive via catch-up
- [ ] Confirm stream-end is received
- [ ] Confirm the complete text matches the corpus

### 7e. Disconnect After Stream Completed

- [ ] Send a message and wait for the stream to complete
- [ ] Toggle airplane mode ON, then OFF
- [ ] Confirm the completed message is still displayed
- [ ] Confirm a new message can be sent

### 7f. Server Restart During Stream

- [ ] Send a message and wait for ~20 words
- [ ] Kill and restart the backend server
- [ ] Confirm the app shows "reconnecting" then "connected"
- [ ] Confirm the in-progress message is lost (expected: server state is in-memory only)
- [ ] Confirm a new message can be sent after reconnection

---

## Test Environment Setup

1. Start the backend:
   ```bash
   cd backend
   npm run build
   node dist/main.js
   ```
2. Verify the server is running: open `http://localhost:3000` in a browser (should see default NestJS page or 404).
3. Run integration tests:
   ```bash
   cd scripts
   npm install
   npx tsx test-reconnect.ts
   ```
4. For iOS testing: build and run the Xcode project on a device (airplane mode requires a real device, not a simulator).

---

## Pass Criteria

- All automated integration tests pass (exit code 0)
- All manual checklist items above are verified on a real iOS device
- No crashes, no console errors, no data loss during normal operation
- Reconnect/resume delivers complete text with no gaps or duplicates
