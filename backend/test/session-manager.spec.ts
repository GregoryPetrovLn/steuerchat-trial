import { SessionManager } from '../src/chat/session-manager';
import { SessionState } from '../src/types';

jest.useFakeTimers();

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  afterEach(() => {
    manager.onModuleDestroy();
    jest.clearAllTimers();
  });

  it('should create and retrieve sessions', () => {
    const session = manager.createSession('msg-1');
    expect(session).toBeDefined();
    expect(session.messageId).toBe('msg-1');

    const retrieved = manager.getSession('msg-1');
    expect(retrieved).toBe(session);
  });

  it('should return undefined for non-existent session', () => {
    expect(manager.getSession('does-not-exist')).toBeUndefined();
  });

  it('should remove session and clean up', () => {
    const session = manager.createSession('msg-2');
    session.start('socket-1', () => {});

    manager.removeSession('msg-2');

    expect(manager.getSession('msg-2')).toBeUndefined();
    expect(manager.sessions.size).toBe(0);
  });

  it('should GC expired BUFFERING sessions', () => {
    const session = manager.createSession('msg-gc');
    session.start('socket-1', () => {});

    // Emit a few words then pause
    jest.advanceTimersByTime(600);
    session.pause();

    // Advance past the 60s BUFFERING TTL and trigger GC (runs every 30s)
    jest.advanceTimersByTime(90_000);

    expect(manager.getSession('msg-gc')).toBeUndefined();
  });

  it('should GC expired COMPLETED sessions', () => {
    // Create a session with a tiny corpus to complete quickly
    const session = manager.createSession('msg-complete');
    session.start('socket-1', () => {});

    // Advance enough to complete (all words)
    const totalTime = session.words.length * 200 + 200;
    jest.advanceTimersByTime(totalTime);

    expect(session.state).toBe(SessionState.COMPLETED);

    // Advance past 30s COMPLETED TTL + GC interval
    jest.advanceTimersByTime(60_000);

    expect(manager.getSession('msg-complete')).toBeUndefined();
  });

  it('should clean up all sessions on module destroy', () => {
    manager.createSession('msg-a');
    manager.createSession('msg-b');
    manager.createSession('msg-c');

    expect(manager.sessions.size).toBe(3);

    manager.onModuleDestroy();

    expect(manager.sessions.size).toBe(0);
  });
});
