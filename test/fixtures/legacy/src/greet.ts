import { findUser } from './users';

/** @strict */
export function greet(id: number): string {
  return 'hello ' + findUser(id).nickname.toUpperCase();
}

export function legacyGreet(id: number): string {
  return 'hello ' + findUser(id).name;
}
