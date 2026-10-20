/** Sign-in stage shared by the vendor screens. */
export type Stage =
  | { kind: 'pin'; token: string; name?: string }
  | { kind: 'setup'; token: string; needsEmail: boolean; name?: string };
