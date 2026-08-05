// WinUI XAML uses #AARRGGBB. Alpha values below are translated to CSS/RN rgba().
export const theme = {
  color: {
    brand: {
      // The shared product accent matches the primary blue in the DolphinCloud
      // logo so controls and navigation use one consistent color.
      primary: '#1677FE',
      secondary: '#1677FE',
      hover: 'rgba(22,119,254,0.9)',
      pressed: 'rgba(22,119,254,0.8)',
      disabled: 'rgba(0,0,0,0.216)',
      onPrimaryMuted: 'rgba(255,255,255,0.078)',
      onPrimaryBorder: 'rgba(255,255,255,0.078)',
    },
    surface: {
      page: '#F3F3F3',
      card: 'rgba(255,255,255,0.702)',
      cardSecondary: 'rgba(246,246,246,0.502)',
      cardTertiary: '#FFFFFF',
      control: 'rgba(255,255,255,0.702)',
      controlSecondary: 'rgba(249,249,249,0.502)',
      controlTertiary: 'rgba(249,249,249,0.302)',
      input: '#FFFFFF',
      layer: 'rgba(255,255,255,0.502)',
      layerAlt: '#FFFFFF',
      muted: '#F9F9F9',
      secondary: '#EEEEEE',
      primaryTint: 'rgba(22,119,254,0.1)',
      secondaryTint: 'rgba(0,0,0,0.035)',
      subtleHover: 'rgba(0,0,0,0.035)',
      subtlePressed: 'rgba(0,0,0,0.024)',
      disabled: 'rgba(249,249,249,0.302)',
    },
    text: {
      primary: 'rgba(0,0,0,0.894)',
      secondary: 'rgba(0,0,0,0.620)',
      tertiary: 'rgba(0,0,0,0.447)',
      disabled: 'rgba(0,0,0,0.361)',
      onAccent: '#FFFFFF',
    },
    // Lucide strokes need opaque colors. Applying an alpha to each SVG path
    // makes path intersections visibly darker than the rest of the icon.
    icon: {
      primary: '#1B1B1B',
      secondary: '#616161',
      disabled: '#A3A3A3',
    },
    border: {
      default: 'rgba(0,0,0,0.060)',
      control: 'rgba(0,0,0,0.162)',
      strong: 'rgba(0,0,0,0.447)',
      divider: 'rgba(0,0,0,0.060)',
    },
    system: {
      success: '#0F7B0F',
      successBackground: '#DFF6DD',
      caution: '#9D5D00',
      cautionBackground: '#FFF4CE',
      critical: '#C42B1C',
      criticalBackground: '#FDE7E9',
      neutralBackground: 'rgba(0,0,0,0.024)',
    },
    overlay: {
      smoke: 'rgba(0,0,0,0.302)',
    },
  },
  radius: {
    card: 8,
    control: 4,
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
    family: 'Segoe UI Variable',
    size: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 20,
      xl: 24,
      display: 28,
    },
    weight: {
      regular: '400',
      semibold: '600',
      bold: '700',
    },
  },
  shadow: {
    card: '0 2px 4px rgba(0,0,0,0.06)',
    flyout: '0 8px 16px rgba(0,0,0,0.14)',
    dialog: '0 16px 32px rgba(0,0,0,0.18)',
    focus: '0 0 0 3px rgba(22,119,254,0.46)',
  },
} as const;
