import { useState } from 'react';
import {
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type InteractivePressableState = {
  readonly focused: boolean;
  readonly hovered: boolean;
  readonly pressed: boolean;
};

export type InteractivePressableProps = Omit<PressableProps, 'style'> & {
  readonly style?:
    | StyleProp<ViewStyle>
    | ((state: InteractivePressableState) => StyleProp<ViewStyle>);
};

const WEB_TRANSITION = Platform.select({
  web: {
    cursor: 'pointer',
    transitionDuration: '83ms',
    transitionProperty: 'background-color, border-color, box-shadow, opacity',
    transitionTimingFunction: 'linear',
  } as ViewStyle,
});

const WEB_DISABLED = Platform.select({
  web: { cursor: 'auto' } as ViewStyle,
});

export function InteractivePressable({
  disabled,
  onBlur,
  onFocus,
  onHoverIn,
  onHoverOut,
  style,
  ...props
}: InteractivePressableProps) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      {...props}
      disabled={disabled}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onHoverIn={(event) => {
        setHovered(true);
        onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        setHovered(false);
        onHoverOut?.(event);
      }}
      style={({ pressed }) => [
        WEB_TRANSITION,
        disabled && WEB_DISABLED,
        typeof style === 'function'
          ? style({ focused, hovered, pressed })
          : style,
      ]}
    />
  );
}
