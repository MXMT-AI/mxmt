import styles from "./login-backdrop.module.css";

const chartHeight = 520;
const barTops = [
  400, 386, 402, 371, 354, 369, 325, 317, 343, 322,
  301, 314, 270, 282, 253, 264, 251, 271, 239, 268,
  237, 263, 253, 275, 247, 262, 227, 238, 206, 218,
  185, 208, 172, 166, 189, 153, 125, 148, 101, 114,
  78, 91,
];
const barPath = barTops.map((top, index) => `M${24 + index * 34} ${top}V${chartHeight}`).join(" ");
const markers = [
  { x: 229, y: 327 },
  { x: 1147, y: 161 },
  { x: 1412, y: 82 },
];

export function LoginBackdrop() {
  return (
    <div className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden before:absolute before:inset-0 before:content-[''] ${styles.backdrop}`} aria-hidden="true">
      <svg className={`absolute bottom-0 h-[min(100%,520px)] w-full ${styles.chart}`} viewBox={`0 0 1440 ${chartHeight}`} preserveAspectRatio="xMidYMax slice">
        <path className="fill-none stroke-(--accent) [stroke-width:13] [stroke-dasharray:3_3] opacity-[.19]" d={barPath} />
        <path className="fill-none stroke-(--violet-ink) [stroke-width:1.5] [stroke-dasharray:5_6] opacity-[.42]" d="M0 440 95 422 175 428 264 392 334 408 432 363 518 368 590 335 672 348 752 306 829 321 907 283 981 306 1053 264 1133 280 1216 233 1289 249 1366 194 1440 200" />
        <path className="fill-none stroke-(--accent) [stroke-width:1.6] opacity-[.48]" d="M0 395 88 369 160 379 229 327 301 341 380 305 462 310 550 269 620 286 700 250 781 276 853 241 930 246 1005 203 1081 215 1147 161 1213 176 1283 124 1347 135 1412 82 1440 87" />
        <g className="fill-(--bg) stroke-(--accent) [stroke-width:1.5] opacity-70">
          {markers.map(({ x, y }) => <circle key={x} cx={x} cy={y} r="4" />)}
        </g>
      </svg>
    </div>
  );
}
