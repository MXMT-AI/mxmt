import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/routing";
import { BrandMark } from "./BrandMark";
import styles from "./ProblemScreen.module.css";

const copy = {
  uk: {
    "404": { title: "Сторінку не знайдено", description: "Можливо, її перемістили або в адресі є помилка." },
    "500": { title: "Щось пішло не так", description: "Не вдалося завантажити сторінку. Спробуйте ще раз." },
    home: "На головну",
    docs: "Документація",
    retry: "Спробувати ще раз",
  },
  en: {
    "404": { title: "Page not found", description: "The page may have moved, or there may be a typo in the address." },
    "500": { title: "Something went wrong", description: "The page could not be loaded. Please try again." },
    home: "Back to home",
    docs: "Documentation",
    retry: "Try again",
  },
};
const heights = [15, 24, 21, 34, 28, 42, 48, 40, 60, 55, 75, 69, 86, 80, 96, 89];

export function ProblemScreen({
  code,
  locale,
  retry,
  embedded = false,
}: {
  code: "404" | "500";
  locale: Locale;
  retry?: () => void;
  embedded?: boolean;
}) {
  const labels = copy[locale];
  const home = `/${locale}`;
  const Heading = embedded ? "h2" : "h1";
  const Content = embedded ? "section" : "main";

  return (
    <div className={styles.page} data-embedded={embedded || undefined}>
      {!embedded && (
        <header className={styles.header}>
          <div className={styles.wrap}>
            <a href={home} className={styles.brand}>
              <BrandMark transparent /> MXMT <span>Analytics</span>
            </a>
            <a className={styles.docs} href={`${home}/docs`}>{labels.docs}<ArrowRight aria-hidden="true" size={16} /></a>
          </div>
        </header>
      )}
      <Content className={`${styles.wrap} ${styles.body}`} aria-labelledby="problem-title">
        <div className={styles.copy}>
          <p className={styles.code} data-code={code}>{code}</p>
          <Heading id="problem-title">{labels[code].title}</Heading>
          <p className={styles.description}>{labels[code].description}</p>
          <div className={styles.actions}>
            {retry && (
              <button type="button" className={styles.primary} onClick={retry}>
                <RotateCcw size={17} aria-hidden="true" />{labels.retry}
              </button>
            )}
            <a href={home} className={retry ? styles.secondary : styles.primary}>
              <ArrowLeft size={17} aria-hidden="true" />{labels.home}
            </a>
          </div>
        </div>
        <div className={styles.art} data-code={code} aria-hidden="true">
          <div className={styles.chart}>
            <div className={styles.bars}>
              {heights.map((height, index) => (
                <i key={index} style={{ "--height": `${height}%` } as CSSProperties} />
              ))}
            </div>
          </div>
          <span className={styles.artCode}>{code}</span>
        </div>
      </Content>
    </div>
  );
}
