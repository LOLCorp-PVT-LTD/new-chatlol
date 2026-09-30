import type { Server } from 'socket.io';
import type { ClientEvents, ServerEvents } from '@chatlol/shared';

export type IO = Server<ClientEvents, ServerEvents>;
let _io: IO | null = null;
export const setIo = (io: IO) => { _io = io; };
export const io = () => _io;

export const room = {
  user: (id: string) => `user:${id}`,
  lounge: (id: string) => `lounge:${id}`,
  stream: (id: string) => `stream:${id}`,
  global: 'global',
};
