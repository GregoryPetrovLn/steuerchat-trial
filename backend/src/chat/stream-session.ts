import { SessionState, StreamChunkPayload } from '../types';
import { CORPUS_WORDS } from './corpus';

/** Callback used to emit a stream-chunk to the connected client. */
export type EmitCallback = (event: string, payload: unknown) => void;

/**
 * Manages the streaming of words for a single message.
 *
 * The session advances through CORPUS_WORDS at a fixed interval (200ms = 5 words/sec).
 * When the client is connected (STREAMING), words are emitted immediately.
 * When the client is disconnected (BUFFERING), words accumulate in an internal buffer.
 */
export class StreamSession {
  public readonly messageId: string;
  public readonly words: string[];
  public currentIndex: number;
  public state: SessionState;
  public buffer: Array<{ word: string; index: number }>;
  public socketId: string | null;

  private timer: ReturnType<typeof setInterval> | null;
  private emitCb: EmitCallback | null;
  private disconnectedAt: number | null;

  constructor(messageId: string) {
    this.messageId = messageId;
    this.words = CORPUS_WORDS;
    this.currentIndex = 0;
    this.state = SessionState.STREAMING;
    this.buffer = [];
    this.socketId = null;
    this.timer = null;
    this.emitCb = null;
    this.disconnectedAt = null;
  }

  /**
   * Begin streaming words to the given socket.
   * Each tick emits one word via the callback or buffers it if disconnected.
   */
  start(socketId: string, emitCallback: EmitCallback): void {
    this.socketId = socketId;
    this.emitCb = emitCallback;
    this.state = SessionState.STREAMING;

    this.timer = setInterval(() => {
      this.tick();
    }, 200);
  }

  /** Internal: advance one word per tick. */
  private tick(): void {
    if (this.currentIndex >= this.words.length) {
      this.complete();
      return;
    }

    const word = this.words[this.currentIndex];
    const index = this.currentIndex;

    if (this.state === SessionState.STREAMING && this.emitCb) {
      const payload: StreamChunkPayload = {
        messageId: this.messageId,
        word,
        index,
      };
      this.emitCb('stream-chunk', payload);
    } else if (this.state === SessionState.BUFFERING) {
      this.buffer.push({ word, index });
    }

    this.currentIndex++;

    // Check completion after incrementing
    if (this.currentIndex >= this.words.length) {
      this.complete();
    }
  }

  /** Transition to COMPLETED and notify the client if connected. */
  private complete(): void {
    this.clearTimer();

    if (this.state === SessionState.STREAMING && this.emitCb) {
      this.emitCb('stream-end', {
        messageId: this.messageId,
        totalWords: this.words.length,
      });
    }

    this.state = SessionState.COMPLETED;
    this.disconnectedAt = Date.now();
  }

  /**
   * Called when the client disconnects.
   * The timer keeps running but words go into the buffer.
   */
  pause(): void {
    if (
      this.state === SessionState.CANCELLED ||
      this.state === SessionState.COMPLETED
    ) {
      return;
    }

    this.state = SessionState.BUFFERING;
    this.socketId = null;
    this.emitCb = null;
    this.disconnectedAt = Date.now();
  }

  /**
   * Called when the client reconnects and sends a resume event.
   * Flushes any buffered words from lastWordIndex+1 onward, then continues streaming.
   */
  resume(
    socketId: string,
    lastWordIndex: number,
    emitCallback: EmitCallback,
  ): Array<{ word: string; index: number }> {
    this.socketId = socketId;
    this.emitCb = emitCallback;
    this.disconnectedAt = null;

    // Build catch-up: words the client missed (from lastWordIndex+1 to currentIndex-1).
    // These may be in the buffer or we can reconstruct them from the word list.
    const catchUpWords: Array<{ word: string; index: number }> = [];
    for (let i = lastWordIndex + 1; i < this.currentIndex; i++) {
      catchUpWords.push({ word: this.words[i], index: i });
    }

    // Clear the buffer since we are flushing everything via catch-up.
    this.buffer = [];

    if (this.state === SessionState.COMPLETED) {
      // Stream already finished; just send catch-up and stream-end.
      if (this.emitCb) {
        this.emitCb('stream-end', {
          messageId: this.messageId,
          totalWords: this.words.length,
        });
      }
      // Keep COMPLETED state; set disconnectedAt for GC.
      this.disconnectedAt = Date.now();
    } else {
      // Resume normal streaming.
      this.state = SessionState.STREAMING;
    }

    return catchUpWords;
  }

  /** Explicitly cancel the stream. Stops the timer and marks state. */
  cancel(): void {
    this.clearTimer();
    this.state = SessionState.CANCELLED;
  }

  /** Tear down all resources. */
  destroy(): void {
    this.clearTimer();
    this.emitCb = null;
    this.socketId = null;
    this.buffer = [];
  }

  /**
   * Check whether this session has exceeded its TTL since the last disconnect.
   * Only applies to BUFFERING and COMPLETED states.
   */
  isExpired(ttlMs: number): boolean {
    if (this.disconnectedAt === null) {
      return false;
    }
    return Date.now() - this.disconnectedAt > ttlMs;
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
