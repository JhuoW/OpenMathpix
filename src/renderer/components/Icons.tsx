import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;

function Icon({ children, className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

export const SnipIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
    <path d="M9 12h6M12 9v6" />
  </Icon>
);

export const HistoryIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5M12 7v5l3 2" />
  </Icon>
);

export const SettingsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Icon>
);

export const CopyIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a1 1 0 0 1 1-1h10" />
  </Icon>
);

export const ImageIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="m21 16-5-5-9 9" />
  </Icon>
);

export const UndoIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </Icon>
);

export const WarningIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3 2 20h20L12 3z" />
    <path d="M12 10v4M12 17h.01" />
  </Icon>
);

export const DropIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
  </Icon>
);

export const ChevronIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const TrashIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);
