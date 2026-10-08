import { findUser } from './users';

/** @strict */
export function greet(id: number): string {
  const user = findUser(id);
  return user === null ? 'hello stranger' : 'hello ' + (user.nickname ?? user.name);
}

export function legacyGreet(id: number): string {
  return 'hello ' + findUser(id).name;
}
