import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents } from '@chatlol/shared';
import { API_URL } from './api';
import { session } from './store';

export type AppSocket = Socket<ServerEvents, ClientEvents>;
let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) socket = io(API_URL, { auth: { token: session.get().token }, transports: ['websocket'] });
  return socket;
}
export function resetSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  return getSocket();
}
