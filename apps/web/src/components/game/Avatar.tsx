import { publicStorageUrl } from "@/lib/env";

const COLORS = ["#d7263d", "#237a40", "#b86f00", "#4a5185", "#6d28d9", "#0e7490"];

/** Hunter avatar: uploaded photo, or initials on a colour picked from the name. */
export function Avatar({ handle, path, size = 40 }: { handle: string; path?: string | null; size?: number }) {
  if (path) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={publicStorageUrl("avatars", path)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-full object-cover ring-2 ring-white"
        style={{ width: size, height: size }}
      />
    );
  }
  const code = [...handle].reduce((a, c) => a + c.codePointAt(0)!, 0);
  return (
    <span
      aria-hidden="true"
      className="font-display inline-flex shrink-0 items-center justify-center rounded-full text-white ring-2 ring-white"
      style={{ width: size, height: size, background: COLORS[code % COLORS.length], fontSize: size * 0.42 }}
    >
      {[...handle][0]?.toUpperCase()}
    </span>
  );
}
