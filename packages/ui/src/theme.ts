export const theme = {
  color: {
    brand: {
      primary: '#2563EB',
      secondary: '#3B82F6',
      onPrimaryMuted: 'rgba(255,255,255,0.14)',
      onPrimaryBorder: 'rgba(255,255,255,0.28)',
    },
    surface: {
      page: '#F5F7FA',
      card: '#FFFFFF',
      muted: '#F0F3F7',
      primaryTint: '#EDF3FF',
      secondaryTint: '#F3F6FB',
    },
    text: {
      primary: '#182033',
      secondary: '#667085',
      disabled: '#98A2B3',
    },
    border: {
      default: '#DDE3EA',
    },
  },
  radius: {
    card: 9,
    control: 7,
    pill: 999,
  },
  space: {
    xs: 4,
    sm: 8,
    base: 12,
    md: 16,
    lg: 24,
    xl: 32,
  },
  text: {
    size: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 20,
      xl: 24,
      display: 32,
    },
  },
} as const;
