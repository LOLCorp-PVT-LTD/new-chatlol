let _io = null;
export const setIo = (io) => {
  _io = io;
};
export const io = () => _io;

export const room = {
  user: (id) => `user:${id}`,
  lounge: (id) => `lounge:${id}`,
  stream: (id) => `stream:${id}`,
  arena: (id) => `arena:${id}`,
  global: 'global',
};
