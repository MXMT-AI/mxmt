import styles from "./login-backdrop.module.css";

export function LoginBackdrop() {
  return (
    <div className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${styles.backdrop}`} aria-hidden="true">
      <svg className={`absolute bottom-0 h-[min(100%,520px)] w-full ${styles.chart}`} viewBox="0 0 1440 520" preserveAspectRatio="xMidYMax slice">
        <path className="fill-none stroke-(--accent) [stroke-width:13] [stroke-dasharray:3_3] opacity-[.19]" d="M24 400V520 M58 386V520 M92 402V520 M126 371V520 M160 354V520 M194 369V520 M228 325V520 M262 317V520 M296 343V520 M330 322V520 M364 301V520 M398 314V520 M432 270V520 M466 282V520 M500 253V520 M534 264V520 M568 251V520 M602 271V520 M636 239V520 M670 268V520 M704 237V520 M738 263V520 M772 253V520 M806 275V520 M840 247V520 M874 262V520 M908 227V520 M942 238V520 M976 206V520 M1010 218V520 M1044 185V520 M1078 208V520 M1112 172V520 M1146 166V520 M1180 189V520 M1214 153V520 M1248 125V520 M1282 148V520 M1316 101V520 M1350 114V520 M1384 78V520 M1418 91V520" />
        <path className="fill-none stroke-(--violet-ink) [stroke-width:1.5] [stroke-dasharray:5_6] opacity-[.42]" d="M0 440 95 422 175 428 264 392 334 408 432 363 518 368 590 335 672 348 752 306 829 321 907 283 981 306 1053 264 1133 280 1216 233 1289 249 1366 194 1440 200" />
        <path className="fill-none stroke-(--accent) [stroke-width:1.6] opacity-[.48]" d="M0 395 88 369 160 379 229 327 301 341 380 305 462 310 550 269 620 286 700 250 781 276 853 241 930 246 1005 203 1081 215 1147 161 1213 176 1283 124 1347 135 1412 82 1440 87" />
        <circle className="fill-(--bg) stroke-(--accent) [stroke-width:1.5] opacity-70" cx="229" cy="327" r="4" />
        <circle className="fill-(--bg) stroke-(--accent) [stroke-width:1.5] opacity-70" cx="1147" cy="161" r="4" />
        <circle className="fill-(--bg) stroke-(--accent) [stroke-width:1.5] opacity-70" cx="1412" cy="82" r="4" />
      </svg>
    </div>
  );
}
