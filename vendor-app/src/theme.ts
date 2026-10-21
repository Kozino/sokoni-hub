// Vendor palette, taken from the Sokoni Hub logo: deep teal-green, orange, and white.
export const C = {
  // Backgrounds: a soft green-tinted page, with white cards on top.
  bg: '#F3F8F6',
  surface: '#FFFFFF',
  surface2: '#E6F0EC',
  field: '#F6F9F8',
  // Text
  text: '#0E1F1A',
  text2: '#33463F',
  muted: '#5E6F69',
  // Lines
  border: '#DCE7E2',
  borderSoft: '#EAF1EE',
  // Brand green (logo)
  primary: '#005A48',
  primaryPressed: '#004236',
  primaryDeep: '#003A2F',
  primarySoft: '#E2F1EC',
  primaryLine: '#B8DCCF',
  // Brand orange (logo). Use gold for bars, icons and fills. Use goldText for text on light backgrounds.
  gold: '#FC7800',
  goldPressed: '#E06A00',
  goldSoft: '#FFF1E4',
  goldText: '#B45309',
  // Danger
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  dangerFg: '#991B1B',
};

export type Tone = 'brand' | 'amber' | 'blue' | 'violet' | 'green' | 'red' | 'slate';

/** Foreground and background pairs for status pills and icon tiles. */
export const TONES: Record<Tone, { fg: string; bg: string }> = {
  brand: { fg: '#005A48', bg: '#E2F1EC' },
  amber: { fg: '#B45309', bg: '#FFF1E4' },
  blue: { fg: '#1E40AF', bg: '#DBEAFE' },
  violet: { fg: '#5B21B6', bg: '#EDE9FE' },
  green: { fg: '#065F46', bg: '#D1FAE5' },
  red: { fg: '#991B1B', bg: '#FEE2E2' },
  slate: { fg: '#334155', bg: '#E2E8F0' },
};
