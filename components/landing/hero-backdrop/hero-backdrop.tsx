import type { CSSProperties } from "react";
import styles from "./hero-backdrop.module.css";

const signalHeights = [
  13, 17, 15, 21, 18, 24, 26, 22, 17, 28, 31, 32, 26, 34, 39, 45,
  33, 39, 31, 24, 36, 52, 57, 61, 53, 45, 47, 56, 60, 67, 70, 65,
  47, 50, 54, 72, 80, 87, 91, 84, 70, 62, 69, 82, 92, 100, 89, 80,
  86, 76, 69, 72, 66, 55, 49, 52, 41, 32,
];

export function HeroBackdrop() {
  return (
    <div className={`pointer-events-none absolute inset-x-0 top-0 bottom-[54px] -z-10 overflow-hidden max-[640px]:bottom-[145px] ${styles.art}`} aria-hidden="true">
      <div className={`absolute inset-[-4%_-4%_21%_11%] grid auto-cols-fr grid-flow-col items-end gap-[clamp(3px,.48vw,8px)] -skew-y-[7deg] max-[640px]:inset-[-3%_-37%_35%_-13%] max-[640px]:gap-[3px] ${styles.signal}`}>
        {signalHeights.map((height, index) => (
          <i key={index} className="h-(--height) rounded-[3px]" style={{ "--height": `${height}%`, "--hue": 185 - index * 1.35 } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
