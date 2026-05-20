import { StreamSession } from '../src/chat/stream-session';
import { SessionState } from '../src/types';
import { CORPUS_WORDS } from '../src/chat/corpus';

// Use fake timers so we can advance time precisely.
jest.useFakeTimers();

describe('StreamSession', () => {
  let session: StreamSession;
  const messageId = 'test-msg-001';

  beforeEach(() => {
    session = new StreamSession(messageId);
  });

  afterEach(() => {
    session.destroy();
    jest.clearAllTimers();
  });

  it('should start and emit words in order', () => {
    const emitted: Array<{ event: string; payload: unknown }> = [];
    const emitCb = (event: string, payload: unknown) => {
      emitted.push({ event, payload });
    };

    session.start('socket-1', emitCb);

    // Advance 5 ticks (1 second at 200ms intervals)
    jest.advanceTimersByTime(1000);

    expect(session.state).toBe(SessionState.STREAMING);
    expect(emitted.length).toBe(5);

    // Verify words are in order
    for (let i = 0; i < 5; i++) {
      expect(emitted[i].event).toBe('stream-chunk');
      const payload = emitted[i].payload as {
        messageId: string;
        word: string;
        index: number;
      };
      expect(payload.messageId).toBe(messageId);
      expect(payload.word).toBe(CORPUS_WORDS[i]);
      expect(payload.index).toBe(i);
    }
  });

  it('should cancel and stop emission immediately', () => {
    const emitted: unknown[] = [];
    session.start('socket-1', (_event, payload) => {
      emitted.push(payload);
    });

    // Emit 3 words
    jest.advanceTimersByTime(600);
    expect(emitted.length).toBe(3);

    session.cancel();
    expect(session.state).toBe(SessionState.CANCELLED);

    // Advance more time — no new emissions
    jest.advanceTimersByTime(2000);
    expect(emitted.length).toBe(3);
  });

  it('should buffer words when paused (disconnect)', () => {
    const emitted: unknown[] = [];
    session.start('socket-1', (_event, payload) => {
      emitted.push(payload);
    });

    // Emit 3 words
    jest.advanceTimersByTime(600);
    expect(emitted.length).toBe(3);

    // Disconnect
    session.pause();
    expect(session.state).toBe(SessionState.BUFFERING);

    // Advance 4 more ticks — words go to buffer, not emitted
    jest.advanceTimersByTime(800);
    expect(emitted.length).toBe(3); // no new emissions
    expect(session.buffer.length).toBe(4);
    expect(session.buffer[0].index).toBe(3);
    expect(session.buffer[0].word).toBe(CORPUS_WORDS[3]);
  });

  it('should resume, flush buffer, and continue streaming', () => {
    const emitted: unknown[] = [];
    session.start('socket-1', (_event, payload) => {
      emitted.push(payload);
    });

    // Emit 3 words then disconnect
    jest.advanceTimersByTime(600);
    session.pause();

    // Buffer 4 more words
    jest.advanceTimersByTime(800);
    expect(session.buffer.length).toBe(4);

    // Resume from lastWordIndex=2 (client has words 0,1,2)
    const resumed: unknown[] = [];
    const catchUp = session.resume('socket-2', 2, (_event, payload) => {
      resumed.push(payload);
    });

    // catch-up should contain words at indices 3,4,5,6
    expect(catchUp.length).toBe(4);
    expect(catchUp[0].index).toBe(3);
    expect(catchUp[3].index).toBe(6);
    expect(session.state).toBe(SessionState.STREAMING);

    // Buffer should be cleared after resume
    expect(session.buffer.length).toBe(0);

    // Continue streaming — next tick emits word at currentIndex (7)
    jest.advanceTimersByTime(200);
    expect(resumed.length).toBe(1);
    const payload = resumed[0] as { word: string; index: number };
    expect(payload.index).toBe(7);
  });

  it('should contain correct catch-up words with no gaps or duplicates', () => {
    session.start('socket-1', () => {});

    // Emit 10 words
    jest.advanceTimersByTime(2000);
    session.pause();

    // Buffer 5 more
    jest.advanceTimersByTime(1000);

    // Client says it has up to index 7 (words 0-7)
    const catchUp = session.resume('socket-2', 7, () => {});

    // Should get words 8-14 (indices 8,9,10,11,12,13,14)
    expect(catchUp.length).toBe(7);
    for (let i = 0; i < catchUp.length; i++) {
      expect(catchUp[i].index).toBe(8 + i);
      expect(catchUp[i].word).toBe(CORPUS_WORDS[8 + i]);
    }

    // No duplicates: all indices are unique
    const indices = catchUp.map((w) => w.index);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it('should be marked expired after TTL', () => {
    session.start('socket-1', () => {});
    jest.advanceTimersByTime(400);
    session.pause();

    expect(session.isExpired(1000)).toBe(false);

    // Advance real Date.now by manipulating disconnectedAt
    jest.advanceTimersByTime(1500);

    // isExpired uses Date.now(), so with fake timers we need to check:
    expect(session.isExpired(1000)).toBe(true);
  });

  it('should reach COMPLETED state when all words are sent', () => {
    const events: Array<{ event: string; payload: unknown }> = [];
    session.start('socket-1', (event, payload) => {
      events.push({ event, payload });
    });

    // Advance enough time to send all words
    const totalTime = CORPUS_WORDS.length * 200 + 200;
    jest.advanceTimersByTime(totalTime);

    expect(session.state).toBe(SessionState.COMPLETED);

    // Last event should be stream-end
    const lastEvent = events[events.length - 1];
    expect(lastEvent.event).toBe('stream-end');
    expect((lastEvent.payload as { totalWords: number }).totalWords).toBe(
      CORPUS_WORDS.length,
    );
  });
});
