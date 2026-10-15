/** An expected, user-facing error. `code` is stable for clients; `message` is shown to people. */
export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }
}
