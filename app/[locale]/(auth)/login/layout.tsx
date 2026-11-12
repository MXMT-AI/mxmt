import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { getLocale } from "next-intl/server";
import { BrandMark } from "@/components/BrandMark";
import { landingCopy } from "@/components/landing/copy";
import { Link } from "@/i18n/navigation";
import styles from "./login.module.css";

const homeLabel = { uk: "На головну", en: "Back to home" };

export default async function LoginLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const copy = landingCopy[locale];

  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#login-main">{copy.skip}</a>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link href="/" className={styles.brand}>
            <BrandMark transparent />
            MXMT <span>Analytics</span>
          </Link>
          <Link href="/docs" className={styles.navLink}>
            {copy.documentation}<ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main id="login-main" className={styles.main}>
        <div className={styles.backdrop} aria-hidden="true">
          <svg viewBox="0 0 1440 520" preserveAspectRatio="xMidYMax slice">
            <path className={styles.volume} d="M24 400V520 M58 386V520 M92 402V520 M126 371V520 M160 354V520 M194 369V520 M228 325V520 M262 317V520 M296 343V520 M330 322V520 M364 301V520 M398 314V520 M432 270V520 M466 282V520 M500 253V520 M534 264V520 M568 251V520 M602 271V520 M636 239V520 M670 268V520 M704 237V520 M738 263V520 M772 253V520 M806 275V520 M840 247V520 M874 262V520 M908 227V520 M942 238V520 M976 206V520 M1010 218V520 M1044 185V520 M1078 208V520 M1112 172V520 M1146 166V520 M1180 189V520 M1214 153V520 M1248 125V520 M1282 148V520 M1316 101V520 M1350 114V520 M1384 78V520 M1418 91V520" />
            <path className={styles.comparison} d="M0 440 95 422 175 428 264 392 334 408 432 363 518 368 590 335 672 348 752 306 829 321 907 283 981 306 1053 264 1133 280 1216 233 1289 249 1366 194 1440 200" />
            <path className={styles.trend} d="M0 395 88 369 160 379 229 327 301 341 380 305 462 310 550 269 620 286 700 250 781 276 853 241 930 246 1005 203 1081 215 1147 161 1213 176 1283 124 1347 135 1412 82 1440 87" />
            <circle className={styles.point} cx="229" cy="327" r="4" />
            <circle className={styles.point} cx="1147" cy="161" r="4" />
            <circle className={styles.point} cx="1412" cy="82" r="4" />
          </svg>
        </div>
        {children}
      </main>

      <footer className={styles.footer}>
        <div className={styles.bar}>
          <span>© MXMT Analytics</span>
          <Link href="/" className={styles.navLink}>
            <ArrowLeft size={15} aria-hidden="true" />{homeLabel[locale]}
          </Link>
        </div>
      </footer>
    </div>
  );
}
