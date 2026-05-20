import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { StreamSession } from './stream-session';
import { SessionState } from '../types';

const BUFFERING_TTL_MS = 60_000; // 60 seconds
const COMPLETED_TTL_MS = 30_000; // 30 seconds
const GC_INTERVAL_MS = 30_000; // run GC every 30 seconds

@Injectable()
export class SessionManager implements OnModuleDestroy {
  private readonly logger = new Logger(SessionManager.name);
  public readonly sessions = new Map<string, StreamSession>();
  private gcTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.gcTimer = setInterval(() => {
      this.gc();
    }, GC_INTERVAL_MS);
  }

  /** Create a new streaming session for the given messageId. */
  createSession(messageId: string): StreamSession {
    const session = new StreamSession(messageId);
    this.sessions.set(messageId, session);
    this.logger.log(`Session created: ${messageId}`);
    return session;
  }

  /** Retrieve an existing session by messageId. */
  getSession(messageId: string): StreamSession | undefined {
    return this.sessions.get(messageId);
  }

  /** Destroy and remove a session. */
  removeSession(messageId: string): void {
    const session = this.sessions.get(messageId);
    if (session) {
      session.destroy();
      this.sessions.delete(messageId);
      this.logger.log(`Session removed: ${messageId}`);
    }
  }

  /** Garbage-collect expired sessions. */
  private gc(): void {
    for (const [messageId, session] of this.sessions) {
      let expired = false;

      if (
        session.state === SessionState.BUFFERING &&
        session.isExpired(BUFFERING_TTL_MS)
      ) {
        expired = true;
      } else if (
        session.state === SessionState.COMPLETED &&
        session.isExpired(COMPLETED_TTL_MS)
      ) {
        expired = true;
      } else if (session.state === SessionState.CANCELLED) {
        expired = true;
      }

      if (expired) {
        session.destroy();
        this.sessions.delete(messageId);
        this.logger.log(`GC removed session: ${messageId} (${session.state})`);
      }
    }
  }

  /** Clean up all sessions and the GC timer on module shutdown. */
  onModuleDestroy(): void {
    if (this.gcTimer !== null) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }

    for (const [, session] of this.sessions) {
      session.destroy();
    }
    this.sessions.clear();
    this.logger.log('All sessions destroyed');
  }
}
