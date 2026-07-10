import { Button } from './button';
import { type ThemeMode } from '../theme';

export interface GoogleButtonProps {
  onPress: () => void;
  disabled?: boolean;
  mode?: ThemeMode;
  /** Override the label, e.g. "Sign up with Google". Defaults to "Continue with Google". */
  label?: string;
}

/**
 * Google OAuth entry point: the canonical "Continue with Google" button.
 * Presets the outline variant and `logo-google` glyph so every screen renders an
 * identical, on-brand Google affordance. Prefer this over hand-composing `Button`
 * with an icon.
 */
export function GoogleButton({
  onPress,
  disabled = false,
  mode = 'light',
  label = 'Continue with Google',
}: GoogleButtonProps) {
  return (
    <Button
      mode={mode}
      variant="outline"
      iconName="logo-google"
      label={label}
      onPress={onPress}
      disabled={disabled}
    />
  );
}
