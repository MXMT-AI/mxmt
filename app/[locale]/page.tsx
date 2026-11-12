import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { ArrowDown, ArrowDownUp, ArrowRight, BarChart3, Boxes, ChevronDown, LayoutDashboard, Menu, PackagePlus } from "lucide-react";
import { getLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeProvider";
import { LandingMenu } from "@/components/landing/LandingMenu";
import { landingCopy, landingFeatures } from "@/components/landing/copy";
import styles from "./landing.module.css";

const icons = {
  overview: LayoutDashboard,
  sales: BarChart3,
  stock: Boxes,
  repricing: ArrowDownUp,
  reordering: PackagePlus,
};

const sources = ["Google Sheets", "SalesDrive", "KeyCRM", "Horoshop", "Shopify", "CSV"];
const signalHeights = [
  13, 17, 15, 21, 18, 24, 26, 22, 17, 28, 31, 32, 26, 34, 39, 45,
  33, 39, 31, 24, 36, 52, 57, 61, 53, 45, 47, 56, 60, 67, 70, 65,
  47, 50, 54, 72, 80, 87, 91, 84, 70, 62, 69, 82, 92, 100, 89, 80,
  86, 76, 69, 72, 66, 55, 49, 52, 41, 32,
];

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const copy = landingCopy[locale];
  return {
    title: `MXMT Analytics | ${copy.audience}`,
    description: copy.description,
  };
}

function Brand() {
  return (
    <Link href="/" className={styles.brand}>
      <BrandMark transparent />
      MXMT <span>Analytics</span>
    </Link>
  );
}

export default async function Home() {
  const locale = await getLocale();
  const copy = landingCopy[locale];
  const otherLocale = locale === "uk" ? "en" : "uk";
  const sectionLinks = (
    <>
      <a href="#workflow">{copy.workflow}</a>
      <a href="#integrations">{copy.integrations}</a>
    </>
  );
  const languageLink = (
    <a href={getPathname({ href: "/", locale: otherLocale })} hrefLang={otherLocale} lang={otherLocale} className={styles.language}>
      {copy.language}
    </a>
  );
  const authLinks = (
    <>
      <Link href="/login">{copy.login}</Link>
      <Link href="/register" className={styles.primary}>{copy.register}</Link>
    </>
  );

  return (
    <div className={styles.landing}>
      <a className={styles.skip} href="#main-content">{copy.skip}</a>
      <header className={styles.header}>
        <a href="#integrations" className={styles.announcement}>
          {copy.announcement} <ArrowRight aria-hidden="true" size={14} />
        </a>
        <div className={styles.headerRow}>
          <div className={`${styles.wrap} ${styles.headerInner}`}>
            <Brand />
            <nav className={styles.desktopNav} aria-label={copy.navigation}>
              <LandingMenu
                className={styles.productMenu}
                label={<>{copy.product} <ChevronDown aria-hidden="true" size={14} /></>}
              >
                {landingFeatures.map((feature) => {
                  const Icon = icons[feature];
                  return <a key={feature} href={`#${feature}`}><Icon aria-hidden="true" size={16} />{copy.features[feature].title}</a>;
                })}
              </LandingMenu>
              {sectionLinks}
            </nav>
            <div className={styles.headerActions}>
              {languageLink}
              <ThemeToggle />
              {authLinks}
            </div>
            <LandingMenu className={styles.mobileMenu} label={<><Menu aria-hidden="true" size={23} /><span className="sr-only">{copy.menu}</span></>}>
              <nav aria-label={copy.navigation}>
                <a href="#product">{copy.product}</a>
                {sectionLinks}
              </nav>
              <div className={styles.mobileActions}>{languageLink}{authLinks}</div>
              <div className={styles.mobileTheme}><ThemeToggle placement="inline" /></div>
            </LandingMenu>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-heading">
          <div className={styles.art} aria-hidden="true">
            <div className={styles.signal}>
              {signalHeights.map((height, index) => (
                <i key={index} style={{ "--height": `${height}%`, "--hue": 185 - index * 1.35 } as CSSProperties} />
              ))}
            </div>
          </div>
          <div className={styles.wrap}>
            <div className={styles.heroContent}>
              <p className={styles.audience}>{copy.audience}</p>
              <h1 id="hero-heading">{copy.headline[0]} <span>{copy.headline[1]}</span></h1>
              <p className={styles.lede}>{copy.description}</p>
              <div className={styles.buttons}>
                <Link href="/register" className={styles.primary}>{copy.register}<ArrowRight size={17} aria-hidden="true" /></Link>
                <a href="#product" className={styles.secondary}>{copy.explore}<ArrowDown size={16} aria-hidden="true" /></a>
              </div>
            </div>
            <nav className={styles.moduleRail} aria-label={copy.product}>
              {landingFeatures.map((feature) => {
                const Icon = icons[feature];
                return <a key={feature} href={`#${feature}`}><Icon size={19} aria-hidden="true" />{copy.features[feature].title}</a>;
              })}
            </nav>
          </div>
        </section>

        <section id="product" className={`${styles.wrap} ${styles.section}`}>
          <h2>{copy.productHeading}</h2>
          <div className={styles.features}>
            {landingFeatures.map((feature) => {
              const Icon = icons[feature];
              return (
                <article id={feature} key={feature} className={styles.feature}>
                  <Icon aria-hidden="true" size={23} />
                  <h3>{copy.features[feature].title}</h3>
                  <p>{copy.features[feature].description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="workflow" className={styles.workflow}>
          <div className={`${styles.wrap} ${styles.section}`}>
            <h2>{copy.workflowHeading}</h2>
            <ol className={styles.steps}>
              {copy.steps.map((step) => (
                <li key={step.title}>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="integrations" className={`${styles.wrap} ${styles.section} ${styles.integrations}`}>
          <div>
            <h2>{copy.integrationsHeading}</h2>
            <p>{copy.integrationsDescription}</p>
          </div>
          <ul className={styles.sources}>
            {sources.map((source) => <li key={source}>{source}</li>)}
          </ul>
        </section>

        <section className={styles.closing}>
          <div className={`${styles.wrap} ${styles.section}`}>
            <h2>{copy.closing}</h2>
            <div className={styles.buttons}>
              <Link href="/register" className={styles.primary}>{copy.register}<ArrowRight size={17} aria-hidden="true" /></Link>
              <Link href="/login" className={styles.secondary}>{copy.login}</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={`${styles.wrap} ${styles.footer}`}>
        <Brand />
        <Link href="/login">{copy.login}<ArrowRight size={15} aria-hidden="true" /></Link>
      </footer>
    </div>
  );
}
