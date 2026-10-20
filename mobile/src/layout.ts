import { useWindowDimensions } from 'react-native';

/**
 * Shared responsive rules, so phone, tablet and iPad screens behave the same way.
 * phone   < 600 pt  (most phones, including portrait Android)
 * tablet  600–1023 pt (iPad mini and iPad in portrait, Android tablets)
 * desktop ≥ 1024 pt (iPad in landscape and large tablets)
 */
export const BREAKPOINTS = { tablet: 600, desktop: 1024 } as const;

/** Forms and action bars stop stretching across wide screens at this width. */
export const CONTENT_MAX_WIDTH = 560;

/** Shared spacing and radius scale. Use these for new or changed screens. */
export const SPACING = { xs: 6, sm: 10, md: 16, lg: 24 } as const;
export const RADIUS = { field: 12, card: 16, pill: 22 } as const;

export function useLayout() {
  const { width } = useWindowDimensions();
  const size: 'phone' | 'tablet' | 'desktop' =
    width >= BREAKPOINTS.desktop ? 'desktop' : width >= BREAKPOINTS.tablet ? 'tablet' : 'phone';
  return {
    width,
    size,
    isPhone: size === 'phone',
    /** undefined on phones (full width); a centred column on tablets and iPads. */
    contentMaxWidth: size === 'phone' ? undefined : CONTENT_MAX_WIDTH,
  };
}
