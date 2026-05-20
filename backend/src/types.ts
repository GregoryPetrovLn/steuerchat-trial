/** Payload sent by the client to start a new stream. */
export interface SendMessagePayload {
  messageId: string;
  text: string;
}

/** Payload sent by the client to cancel an active stream. */
export interface CancelPayload {
  messageId: string;
}

/** Payload sent by the client to resume after reconnect. */
export interface ResumePayload {
  messageId: string;
  lastWordIndex: number;
}

/** A single streamed word sent from server to client. */
export interface StreamChunkPayload {
  messageId: string;
  word: string;
  index: number;
}

/** Batch of missed words sent after reconnect. */
export interface CatchUpPayload {
  messageId: string;
  words: Array<{ word: string; index: number }>;
}

/** Sent when the stream finishes normally. */
export interface StreamEndPayload {
  messageId: string;
  totalWords: number;
}

/** Sent when the server confirms cancellation. */
export interface StreamCancelledPayload {
  messageId: string;
  lastIndex: number;
}

/** Generic error payload. */
export interface ErrorPayload {
  messageId?: string;
  message: string;
}

/** Possible states for a stream session. */
export enum SessionState {
  STREAMING = 'STREAMING',
  BUFFERING = 'BUFFERING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
