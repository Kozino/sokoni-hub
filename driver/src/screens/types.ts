/** Sign-in steps after the password: a PIN the rider already has, or a first-time PIN setup. */
export type Stage =
  | { kind: 'pin'; token: string; name?: string }
  | { kind: 'setup'; token: string; needsEmail: boolean; name?: string };
