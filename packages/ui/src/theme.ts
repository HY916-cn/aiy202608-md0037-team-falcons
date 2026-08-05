export const theme = {
  color: {
    brand: {
      primary: '#1677FF',
      secondary: '#22D3EE',
      onPrimaryMuted: 'rgba(255,255,255,0.14)',
      onPrimaryBorder: 'rgba(255,255,255,0.28)',
    },
    surface: {
      page: '#F8FAFC',
      card: '#FFFFFF',
      muted: '#F1F5F9',
      primaryTint: '#EAF3FF',
      secondaryTint: '#ECFEFF',
    },
    text: {
      primary: '#0F172A',
      secondary: '#64748B',
      disabled: '#94A3B8',
    },
    border: {
      default: '#E2E8F0',
    },
  },
  radius: {
    card: 12,
    control: 10,
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
