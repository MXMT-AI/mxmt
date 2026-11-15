import type { LandingCopy } from "../copy";
import { landingFeatures } from "../landing-features";

const styles = {
  row: {
    link: "flex min-h-[68px] items-center justify-center gap-[9px] text-sm text-landing-muted not-first:border-l not-first:border-landing-line hover:text-landing-mint max-[640px]:min-h-[38px] max-[640px]:text-[13px] max-[640px]:not-first:border-0",
    icon: "shrink-0 max-[640px]:w-[15px]",
    iconSize: 19,
  },
  menu: {
    link: "flex items-center gap-2.5 rounded-md px-3 py-2.5 hover:bg-landing-hover-surface",
    icon: "text-landing-mint",
    iconSize: 16,
  },
};

export function FeatureLinks({ copy, variant }: {
  copy: Pick<LandingCopy, "features">;
  variant: keyof typeof styles;
}) {
  const style = styles[variant];

  return (
    <>
      {landingFeatures.map(({ id, Icon }) => (
        <a key={id} href={`#${id}`} className={style.link}>
          <Icon size={style.iconSize} aria-hidden="true" className={style.icon} />
          {copy.features[id].title}
        </a>
      ))}
    </>
  );
}
