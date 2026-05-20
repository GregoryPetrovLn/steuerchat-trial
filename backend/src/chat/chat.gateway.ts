import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SessionManager } from './session-manager';
import {
  SendMessagePayload,
  CancelPayload,
  ResumePayload,
  SessionState,
} from '../types';

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  /**
   * Two-way mapping between messageId and socketId so we can:
   * 1. Find the socket for a given message (messageId -> socketId).
   * 2. Find all messages owned by a socket on disconnect (socketId -> Set<messageId>).
   */
  private messageToSocket = new Map<string, string>();
  private socketToMessages = new Map<string, Set<string>>();

  constructor(private readonly sessionManager: SessionManager) {}

  // ──────────────────────────── Connection lifecycle ────────────────────────

  handleConnection(socket: Socket): void {
    this.logger.log(`Client connected: ${socket.id}`);
  }

  handleDisconnect(socket: Socket): void {
    this.logger.log(`Client disconnected: ${socket.id}`);

    const messageIds = this.socketToMessages.get(socket.id);
    if (!messageIds) {
      return;
    }

    for (const messageId of messageIds) {
      const session = this.sessionManager.getSession(messageId);
      if (session) {
        session.pause();
        this.logger.log(`Session paused (buffering): ${messageId}`);
      }
      this.messageToSocket.delete(messageId);
    }

    this.socketToMessages.delete(socket.id);
  }

  // ──────────────────────────── Event handlers ─────────────────────────────

  @SubscribeMessage('send-message')
  handleSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: SendMessagePayload,
  ): void {
    const { messageId, text } = payload;

    if (!messageId || typeof messageId !== 'string') {
      socket.emit('error', { message: 'Missing or invalid messageId' });
      return;
    }

    // Reject if a session already exists and is still active.
    const existing = this.sessionManager.getSession(messageId);
    if (
      existing &&
      existing.state !== SessionState.CANCELLED &&
      existing.state !== SessionState.COMPLETED
    ) {
      socket.emit('error', {
        messageId,
        message: 'A stream for this messageId is already active',
      });
      return;
    }

    // Clean up any leftover completed/cancelled session.
    if (existing) {
      this.sessionManager.removeSession(messageId);
    }

    this.logger.log(
      `Starting stream for messageId=${messageId}, text="${text}"`,
    );

    const session = this.sessionManager.createSession(messageId);
    this.linkSocketToMessage(socket.id, messageId);

    const emitCallback = (event: string, data: unknown) => {
      // Always emit to the socket currently associated with this message.
      const currentSocketId = this.messageToSocket.get(messageId);
      if (currentSocketId) {
        this.server.to(currentSocketId).emit(event, data);
      }
    };

    session.start(socket.id, emitCallback);
  }

  @SubscribeMessage('cancel')
  handleCancel(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: CancelPayload,
  ): void {
    const { messageId } = payload;

    if (!messageId) {
      socket.emit('error', { message: 'Missing messageId' });
      return;
    }

    const session = this.sessionManager.getSession(messageId);
    if (!session) {
      socket.emit('error', { messageId, message: 'No active session found' });
      return;
    }

    const lastIndex = Math.max(0, session.currentIndex - 1);
    session.cancel();

    socket.emit('stream-cancelled', { messageId, lastIndex });
    this.logger.log(`Stream cancelled: ${messageId} at index ${lastIndex}`);

    this.unlinkMessage(messageId);
    this.sessionManager.removeSession(messageId);
  }

  @SubscribeMessage('resume')
  handleResume(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: ResumePayload,
  ): void {
    const { messageId, lastWordIndex } = payload;

    if (!messageId) {
      socket.emit('error', { message: 'Missing messageId' });
      return;
    }

    if (typeof lastWordIndex !== 'number' || lastWordIndex < -1) {
      socket.emit('error', {
        messageId,
        message: 'Invalid lastWordIndex',
      });
      return;
    }

    const session = this.sessionManager.getSession(messageId);
    if (!session) {
      socket.emit('error', {
        messageId,
        message: 'No session found for this messageId',
      });
      return;
    }

    if (session.state === SessionState.CANCELLED) {
      socket.emit('error', {
        messageId,
        message: 'Session was cancelled',
      });
      return;
    }

    // Update socket mappings to point to the new socket.
    this.unlinkMessage(messageId);
    this.linkSocketToMessage(socket.id, messageId);

    const emitCallback = (event: string, data: unknown) => {
      const currentSocketId = this.messageToSocket.get(messageId);
      if (currentSocketId) {
        this.server.to(currentSocketId).emit(event, data);
      }
    };

    const catchUpWords = session.resume(socket.id, lastWordIndex, emitCallback);

    if (catchUpWords.length > 0) {
      socket.emit('catch-up', { messageId, words: catchUpWords });
    }

    this.logger.log(
      `Session resumed: ${messageId}, caught up ${catchUpWords.length} words`,
    );
  }

  // ──────────────────────────── Private helpers ────────────────────────────

  private linkSocketToMessage(socketId: string, messageId: string): void {
    this.messageToSocket.set(messageId, socketId);

    let messageIds = this.socketToMessages.get(socketId);
    if (!messageIds) {
      messageIds = new Set();
      this.socketToMessages.set(socketId, messageIds);
    }
    messageIds.add(messageId);
  }

  private unlinkMessage(messageId: string): void {
    const socketId = this.messageToSocket.get(messageId);
    if (socketId) {
      const messageIds = this.socketToMessages.get(socketId);
      if (messageIds) {
        messageIds.delete(messageId);
        if (messageIds.size === 0) {
          this.socketToMessages.delete(socketId);
        }
      }
    }
    this.messageToSocket.delete(messageId);
  }
}
