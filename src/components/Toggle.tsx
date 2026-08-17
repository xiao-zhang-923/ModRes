interface ToggleProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  readOnly?: boolean;
  label: string;
  size?: 'small' | 'medium';
}

export function Toggle({
  checked,
  onChange,
  disabled = false,
  readOnly = false,
  label,
  size = 'medium',
}: ToggleProps) {
  const interactive = !disabled && !readOnly && Boolean(onChange);

  return (
    <button
      type="button"
      className="toggle"
      data-size={size}
      data-checked={checked || undefined}
      data-read-only={readOnly || undefined}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-readonly={readOnly || undefined}
      disabled={disabled}
      tabIndex={readOnly ? -1 : undefined}
      onClick={interactive ? () => onChange?.(!checked) : undefined}
    >
      <span className="toggle-thumb" />
    </button>
  );
}
