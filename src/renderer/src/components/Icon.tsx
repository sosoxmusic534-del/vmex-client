import type { SVGProps } from "react";

const P: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9",
  servers: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01M12 7h5M12 17h5",
  apps: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  logs: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h4",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  power: "M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0",
  down: "M12 4v14M6 12l6 6 6-6",
  up: "M12 20V6M6 12l6-6 6 6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  signal: "M5 20v-3M10 20v-7M15 20V9M20 20V5",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z",
  monitor: "M3 4h18v12H3zM8 20h8M12 16v4",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  plus: "M12 5v14M5 12h14",
  paste: "M9 4h6v3H9zM7 5H5v16h14V5h-2M9 12h6M9 16h4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  check: "M5 12l5 5 9-10",
  x: "M6 6l12 12M18 6 6 18",
  copy: "M8 8h12v12H8zM4 16V4h12",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h6M18 9v6a4 4 0 0 1-4 4H8",
  folder: "M3 6h6l2 2h10v11H3z",
  logout: "M10 4H5v16h5M15 8l4 4-4 4M9 12h10",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  discord:
    "M8.5 16.5c-1.6-.4-3-1-4-1.8C4.9 10.9 6 7.8 8 5.5c1.2-.4 2.4-.7 3.6-.8l.4.9a13 13 0 0 1 4 0l.4-.9c1.2.1 2.4.4 3.6.8 2 2.3 3.1 5.4 3.5 9.2-1 .8-2.4 1.4-4 1.8M9.5 12.5h.01M14.5 12.5h.01M8 17c2.6 1.3 5.4 1.3 8 0",
  lock: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3",
  gamepad: "M6 9h12a4 4 0 0 1 3.8 5.3l-.8 2.3a2 2 0 0 1-3.5.6L16 15H8l-1.5 2.2a2 2 0 0 1-3.5-.6l-.8-2.3A4 4 0 0 1 6 9zM8 12v3M6.5 13.5h3M15 12.5h.01M17 14h.01",
  minimize: "M5 12h14",
  maximize: "M5 5h14v14H5z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
};

export type IconName = keyof typeof P;

export default function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={P[name]} />
    </svg>
  );
}
