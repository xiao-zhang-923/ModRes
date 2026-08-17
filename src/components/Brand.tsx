interface BrandProps {
  compact?: boolean;
  inverse?: boolean;
}

export function LogoMark({ inverse = false }: Pick<BrandProps, 'inverse'>) {
  return (
    <span className="logo-mark" data-inverse={inverse || undefined} aria-hidden="true">
      <svg viewBox="0 0 32 32" role="img">
        <path d="M8.3 9.4 4.8 16l3.5 6.6" />
        <path d="m23.7 9.4 3.5 6.6-3.5 6.6" />
        <path d="M11.4 19.1c2.1-5.5 7.1-5.5 9.2 0" />
        <circle cx="16" cy="11.1" r="1.4" />
      </svg>
    </span>
  );
}

export function Brand({ compact = false, inverse = false }: BrandProps) {
  return (
    <span className="brand" data-compact={compact || undefined}>
      <LogoMark inverse={inverse} />
      {!compact && (
        <span className="brand-copy">
          <strong>ModRes</strong>
          <small>Response Studio</small>
        </span>
      )}
    </span>
  );
}
