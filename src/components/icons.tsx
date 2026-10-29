import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const LogoIcon = ({ size = 28, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H6.5A2.5 2.5 0 0 1 4 14.5z" />
    <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H14v17a3 3 0 0 1 3-3h.5a2.5 2.5 0 0 0 2.5-2.5z" />
    <path d="M7.5 8h3M7.5 11h3M16.5 20.5v-4M14.5 18.5h4" />
  </Icon>
);

export const PlayIcon = ({ size = 22, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />
  </Icon>
);

export const PauseIcon = ({ size = 22, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" />
  </Icon>
);

export const StopIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  </Icon>
);

export const PreviousIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M18 6.5v11L9 12z" fill="currentColor" stroke="none" />
    <path d="M6 5v14" />
  </Icon>
);

export const NextIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M6 6.5v11L15 12z" fill="currentColor" stroke="none" />
    <path d="M18 5v14" />
  </Icon>
);

export const ChevronLeftIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="m14.5 5-7 7 7 7" />
  </Icon>
);

export const ChevronRightIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="m9.5 5 7 7-7 7" />
  </Icon>
);

export const SearchIcon = ({ size = 18, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
);

export const UploadIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M12 16V4m0 0L7 9m5-5 5 5" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Icon>
);

export const TrashIcon = ({ size = 18, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6.5 7 7.5 20h9l1-13" />
    <path d="M10 11v5M14 11v5" />
  </Icon>
);

export const SettingsIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
  </Icon>
);

export const BookmarkIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4z" />
  </Icon>
);

export const BookmarkFilledIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4z" fill="currentColor" />
  </Icon>
);

export const SunIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const MoonIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M20.5 14A8.5 8.5 0 0 1 10 3.5a8.5 8.5 0 1 0 10.5 10.5z" />
  </Icon>
);

export const CloseIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);

export const ChaptersIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <circle cx="4" cy="6" r="0.8" fill="currentColor" />
    <circle cx="4" cy="12" r="0.8" fill="currentColor" />
    <circle cx="4" cy="18" r="0.8" fill="currentColor" />
  </Icon>
);

export const FileTextIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Icon>
);

export const EyeIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const DownloadIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M12 4v12m0 0 5-5m-5 5-5-5" />
    <path d="M4 19h16" />
  </Icon>
);

export const ShieldIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M12 3 5 6v6c0 4.5 3 7.8 7 9 4-1.2 7-4.5 7-9V6z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

export const KeyboardIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M18 10h.01M7 14h10" />
  </Icon>
);

export const VolumeIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M4 9v6h4l5 4V5L8 9z" />
    <path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" />
  </Icon>
);

export const AlertIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M12 3 2.5 20h19z" />
    <path d="M12 9v5M12 17h.01" />
  </Icon>
);

export const CheckIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Icon>
);

export const RefreshIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M20 11a8 8 0 1 0-2.3 6.3" />
    <path d="M20 4v7h-7" />
  </Icon>
);

export const ClockIcon = ({ size = 18, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const BookOpenIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M12 6.5C10.5 4.8 8 4 4.5 4H3v15h2c3 0 5.5 1 7 2.5 1.5-1.5 4-2.5 7-2.5h2V4h-1.5C16 4 13.5 4.8 12 6.5z" />
    <path d="M12 6.5v15" />
  </Icon>
);

export const CloudIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M7 18.5h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.6 9.1 4.75 4.75 0 0 0 7 18.5z" />
  </Icon>
);

export const CloudDownloadIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M7.5 17.5H7a4.75 4.75 0 0 1-.4-9.4 6 6 0 0 1 11.5 1.44 4 4 0 0 1-.6 7.96h-.5" />
    <path d="M12 11.5v8M9 16.5l3 3 3-3" />
  </Icon>
);

export const CloudUploadIcon = ({ size = 20, ...rest }: IconProps) => (
  <Icon size={size} {...rest}>
    <path d="M7.5 17.5H7a4.75 4.75 0 0 1-.4-9.4 6 6 0 0 1 11.5 1.44 4 4 0 0 1-.6 7.96h-.5" />
    <path d="M12 19.5v-8M9 14.5l3-3 3 3" />
  </Icon>
);
