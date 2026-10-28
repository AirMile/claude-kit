// Shared delegation state, without a dependency on flow or delegate.
type Balance = { ready: boolean; leaning: boolean };

let current: Balance = { ready: false, leaning: false };

export function setBalance(next: Balance) {
  current = next;
}

export const balance = (): Readonly<Balance> => current;
