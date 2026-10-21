/**
 * Typography. Inter is used across the app so Android and iPhone look identical.
 * Use fw('700') in a style object to pick the matching weight, for example { fontSize: 16, ...fw('700') }.
 */
export const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

const WEIGHT_TO_FONT: Record<string, string> = {
  '100': FONT.regular,
  '200': FONT.regular,
  '300': FONT.regular,
  '400': FONT.regular,
  '500': FONT.medium,
  '600': FONT.semibold,
  '700': FONT.bold,
  '800': FONT.extrabold,
  '900': FONT.extrabold,
  normal: FONT.regular,
  bold: FONT.bold,
};

export const fw = (weight: string): { fontFamily: string } => ({ fontFamily: WEIGHT_TO_FONT[weight] ?? FONT.regular });
