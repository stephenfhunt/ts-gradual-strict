export interface User {
  name: string;
  nickname?: string;
}

export function findUser(id: number): User | null {
  return id > 0 ? { name: 'ada' } : null;
}
