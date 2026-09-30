import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents } from '@chatlol/shared';
import { API_URL, tokenStore } from './api';

export type AppSocket = Socket<ServerEvents, ClientEvents>;
let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io(API_URL || window.location.origin, { auth: { token: tokenStore.get() }, transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function reconnectSocket() {
  socket?.disconnect();
  socket = null;
  return getSocket();
}
