import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const COLLECT_DURATION_MS = 3_000; // Collect chunks for 3 seconds before disconnect
const RECONNECT_DELAY_MS = 5_000; // Wait 5 seconds before reconnecting
const TIMEOUT_MS = 120_000; // Overall test timeout

// The corpus word count — must match backend. We verify dynamically via stream-end.
// Approximate expected count based on the Poe text (~500 words).
const EXPECTED_MIN_WORDS = 400;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function log(tag: string, message: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`${ts} [${tag}] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSocket(): Socket {
  return io(SERVER_URL, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: false, // We manage reconnection manually
  });
}

interface WordEntry {
  word: string;
  index: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Reconnect / Resume
// ─────────────────────────────────────────────────────────────────────────────

async function testReconnect(): Promise<void> {
  log('TEST', '===== Test 1: Reconnect / Resume =====');

  const messageId = uuidv4();
  const receivedWords: WordEntry[] = [];
  let streamEnded = false;
  let totalWordsFromServer = 0;

  // Phase 1: Connect and start streaming
  const socket1 = createSocket();

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10_000);
    socket1.on('connect', () => {
      clearTimeout(timeout);
      log('CONNECT', `Connected to server (socket=${socket1.id})`);
      resolve();
    });
    socket1.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Connection failed: ${err.message}`));
    });
    socket1.connect();
  });

  // Phase 2: Send message and collect chunks for ~3 seconds
  log('SEND', `Sending message ${messageId}`);
  socket1.emit('send-message', { messageId, text: 'Hello' });

  const chunkHandler1 = (data: { messageId: string; word: string; index: number }) => {
    if (data.messageId === messageId) {
      receivedWords.push({ word: data.word, index: data.index });
    }
  };
  socket1.on('stream-chunk', chunkHandler1);

  // Also listen for errors
  socket1.on('error', (err: { message: string }) => {
    log('ERROR', `Server error: ${err.message}`);
  });

  log('STREAM', `Receiving chunks for ${COLLECT_DURATION_MS / 1000}s...`);
  await sleep(COLLECT_DURATION_MS);

  const wordsBeforeDisconnect = receivedWords.length;
  const lastWordIndex = receivedWords.length > 0
    ? receivedWords[receivedWords.length - 1].index
    : -1;

  log('STREAM', `Received ${wordsBeforeDisconnect} chunks (last index: ${lastWordIndex})`);

  // Phase 3: Disconnect (simulate network loss)
  log('DISCONNECT', 'Simulating network loss');
  socket1.disconnect();

  // Phase 4: Wait
  log('WAIT', `Waiting ${RECONNECT_DELAY_MS / 1000} seconds...`);
  await sleep(RECONNECT_DELAY_MS);

  // Phase 5: Reconnect with a NEW socket
  const socket2 = createSocket();

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Reconnection timeout')), 10_000);
    socket2.on('connect', () => {
      clearTimeout(timeout);
      log('RECONNECT', `Reconnected to server (socket=${socket2.id})`);
      resolve();
    });
    socket2.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Reconnection failed: ${err.message}`));
    });
    socket2.connect();
  });

  // Phase 6: Send resume and collect catch-up + remaining chunks
  log('RESUME', `Sending resume from word index ${lastWordIndex}`);

  const streamPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Stream completion timeout')), TIMEOUT_MS);

    socket2.on('catch-up', (data: { messageId: string; words: WordEntry[] }) => {
      if (data.messageId === messageId) {
        log('CATCH-UP', `Received ${data.words.length} missed words`);
        receivedWords.push(...data.words);
      }
    });

    socket2.on('stream-chunk', (data: { messageId: string; word: string; index: number }) => {
      if (data.messageId === messageId) {
        receivedWords.push({ word: data.word, index: data.index });
      }
    });

    socket2.on('stream-end', (data: { messageId: string; totalWords: number }) => {
      if (data.messageId === messageId) {
        clearTimeout(timeout);
        streamEnded = true;
        totalWordsFromServer = data.totalWords;
        log('STREAM-END', `Stream completed (totalWords=${data.totalWords})`);
        resolve();
      }
    });

    socket2.on('error', (err: { message: string }) => {
      log('ERROR', `Server error: ${err.message}`);
    });
  });

  socket2.emit('resume', { messageId, lastWordIndex });

  await streamPromise;

  log('STREAM', `Total words received: ${receivedWords.length}`);

  // Phase 7: Verify
  log('VERIFY', 'Checking completeness...');

  const failures: string[] = [];

  // Sort received words by index for analysis
  const sortedWords = [...receivedWords].sort((a, b) => a.index - b.index);

  // Check stream-end was received
  if (!streamEnded) {
    failures.push('stream-end event was never received');
  }

  // Check total count
  if (sortedWords.length !== totalWordsFromServer) {
    failures.push(
      `Word count mismatch: received ${sortedWords.length}, server reported ${totalWordsFromServer}`,
    );
  }

  // Check for gaps
  for (let i = 0; i < sortedWords.length; i++) {
    if (sortedWords[i].index !== i) {
      failures.push(`Gap or misorder at position ${i}: expected index ${i}, got ${sortedWords[i].index}`);
      break;
    }
  }

  // Check for duplicates
  const indexSet = new Set<number>();
  for (const w of receivedWords) {
    if (indexSet.has(w.index)) {
      failures.push(`Duplicate word at index ${w.index}: "${w.word}"`);
      break;
    }
    indexSet.add(w.index);
  }

  // Check indices cover [0, totalWords-1]
  if (sortedWords.length > 0) {
    if (sortedWords[0].index !== 0) {
      failures.push(`First word index is ${sortedWords[0].index}, expected 0`);
    }
    if (sortedWords[sortedWords.length - 1].index !== totalWordsFromServer - 1) {
      failures.push(
        `Last word index is ${sortedWords[sortedWords.length - 1].index}, expected ${totalWordsFromServer - 1}`,
      );
    }
  }

  // Check minimum word count sanity
  if (totalWordsFromServer < EXPECTED_MIN_WORDS) {
    failures.push(
      `Total words ${totalWordsFromServer} is suspiciously low (expected >=${EXPECTED_MIN_WORDS})`,
    );
  }

  socket2.disconnect();

  if (failures.length > 0) {
    log('FAIL', 'Reconnect test FAILED:');
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
    return Promise.reject(new Error('Reconnect test failed'));
  }

  log('PASS', `All ${totalWordsFromServer} words received in correct order, no gaps, no duplicates`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Cancel
// ─────────────────────────────────────────────────────────────────────────────

async function testCancel(): Promise<void> {
  log('TEST', '===== Test 2: Cancel =====');

  const messageId = uuidv4();
  const receivedWords: WordEntry[] = [];
  let cancelConfirmed = false;

  const socket = createSocket();

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10_000);
    socket.on('connect', () => {
      clearTimeout(timeout);
      log('CONNECT', `Connected (socket=${socket.id})`);
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Connection failed: ${err.message}`));
    });
    socket.connect();
  });

  // Send message
  log('SEND', `Sending message ${messageId}`);
  socket.emit('send-message', { messageId, text: 'Hello' });

  socket.on('stream-chunk', (data: { messageId: string; word: string; index: number }) => {
    if (data.messageId === messageId) {
      receivedWords.push({ word: data.word, index: data.index });
    }
  });

  // Collect a few chunks
  await sleep(1_500); // ~7-8 words at 5 wps
  const wordsBeforeCancel = receivedWords.length;
  log('STREAM', `Received ${wordsBeforeCancel} chunks before cancel`);

  // Send cancel
  log('CANCEL', `Sending cancel for ${messageId}`);

  const cancelPromise = new Promise<void>((resolve) => {
    const timeout = setTimeout(() => resolve(), 5_000); // resolve even if no event (we check flag)
    socket.on('stream-cancelled', (data: { messageId: string; lastIndex: number }) => {
      if (data.messageId === messageId) {
        clearTimeout(timeout);
        cancelConfirmed = true;
        log('CANCEL', `Cancel confirmed at lastIndex=${data.lastIndex}`);
        resolve();
      }
    });
  });

  socket.emit('cancel', { messageId });
  await cancelPromise;

  // Wait a bit and check no more chunks arrive
  const wordsAtCancel = receivedWords.length;
  await sleep(2_000);
  const wordsAfterWait = receivedWords.length;

  const failures: string[] = [];

  if (!cancelConfirmed) {
    failures.push('stream-cancelled event was never received');
  }

  if (wordsAfterWait > wordsAtCancel) {
    failures.push(
      `Received ${wordsAfterWait - wordsAtCancel} chunks AFTER cancel (should be 0)`,
    );
  }

  // Test: can send a new message after cancel
  log('SEND', 'Sending new message after cancel...');
  const messageId2 = uuidv4();
  let newStreamStarted = false;

  const newMessagePromise = new Promise<void>((resolve) => {
    const timeout = setTimeout(() => resolve(), 5_000);
    const handler = (data: { messageId: string; word: string; index: number }) => {
      if (data.messageId === messageId2) {
        newStreamStarted = true;
        clearTimeout(timeout);
        socket.off('stream-chunk', handler);
        resolve();
      }
    };
    socket.on('stream-chunk', handler);
  });

  socket.emit('send-message', { messageId: messageId2, text: 'After cancel' });
  await newMessagePromise;

  if (!newStreamStarted) {
    failures.push('Could not start a new message after cancel');
  } else {
    log('VERIFY', 'New message after cancel works correctly');
  }

  // Cancel this second stream too so we leave things clean
  socket.emit('cancel', { messageId: messageId2 });
  await sleep(500);

  socket.disconnect();

  if (failures.length > 0) {
    log('FAIL', 'Cancel test FAILED:');
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
    return Promise.reject(new Error('Cancel test failed'));
  }

  log('PASS', 'Cancel works correctly: stream stopped, no extra chunks, new message works');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log('START', `Integration tests against ${SERVER_URL}`);
  log('START', '─'.repeat(60));

  try {
    await testReconnect();
    console.log();
    await testCancel();
    console.log();
    log('DONE', 'All tests passed');
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('FATAL', message);
    process.exit(1);
  }
}

main();
