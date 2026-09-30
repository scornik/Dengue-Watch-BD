/** Water drop with Aedes leg bands: the app mark. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <clipPath id="dw-drop">
          <path d="M16 2.5C11 10 6.5 14.6 6.5 19.6a9.5 9.5 0 0 0 19 0C25.5 14.6 21 10 16 2.5z" />
        </clipPath>
      </defs>
      <path d="M16 2.5C11 10 6.5 14.6 6.5 19.6a9.5 9.5 0 0 0 19 0C25.5 14.6 21 10 16 2.5z" fill="#fff" />
      <g clipPath="url(#dw-drop)" fill="#1b1f3b">
        <rect x="0" y="12" width="32" height="3.2" />
        <rect x="0" y="18.4" width="32" height="3.2" />
        <rect x="0" y="24.8" width="32" height="3.2" />
      </g>
      <circle cx="16" cy="9" r="2.2" fill="#d7263d" />
    </svg>
  );
}
