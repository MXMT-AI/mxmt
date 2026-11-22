import { Barcode, Boxes, CalendarDays, ChartNoAxesCombined, FileText, Tags } from "lucide-react";
import { AGENT_BLOCKS } from "@/components/agents/agents.config";
import { Heading } from "@/components/ui/heading/heading";
import { Section } from "@/components/ui/section/section";
import type { LandingCopy } from "../copy";
import styles from "./agents-section.module.css";

const stageIcons = [ChartNoAxesCombined, Tags, CalendarDays, FileText] as const;

export function AgentsSection({ copy }: { copy: LandingCopy["agents"] }) {
  return (
    <Section
      id="agents"
      aria-labelledby="agents-heading"
      className={styles.section}
      contentClassName={styles.container}
      background={<div aria-hidden="true" className={styles.backdrop} />}
    >
      <div className={styles.layout}>
        <div className={styles.overview}>
          <Heading as="h2" variant="section" id="agents-heading">{copy.heading}</Heading>
          <p className={`leading-relaxed text-landing-muted ${styles.intro}`}>{copy.description}</p>
          <div aria-hidden="true" className={styles.network}>
            <span className={`${styles.track} ${styles.catalogueTrack}`} />
            <span className={`${styles.track} ${styles.analyticsTrack}`} />
            <span className={`${styles.track} ${styles.stockTrack}`} />
            <span className={`${styles.node} ${styles.catalogue}`}><Barcode size={20} /></span>
            <span className={`${styles.node} ${styles.analytics}`}><ChartNoAxesCombined size={22} /></span>
            <span className={`${styles.node} ${styles.stock}`}><Boxes size={23} /></span>
            <span className={`${styles.node} ${styles.report}`}><FileText size={20} /></span>
          </div>
        </div>
        <ol className={styles.stages} role="list">
          {copy.stages.map((stage, index) => {
            const Icon = stageIcons[index];
            const agents = AGENT_BLOCKS[index].agents;
            return (
              <li key={stage.title} className={styles.stage}>
                <Icon aria-hidden="true" size={22} className="mt-1 text-landing-mint" />
                <div>
                  <Heading as="h3" variant="item">{stage.title}</Heading>
                  <p className="mt-1 text-sm leading-relaxed text-landing-muted">{stage.description}</p>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 p-0 text-xs leading-relaxed text-landing-ink" role="list">
                    {agents.map((agent) => <li key={agent.id} lang="en">{agent.label}</li>)}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Section>
  );
}
