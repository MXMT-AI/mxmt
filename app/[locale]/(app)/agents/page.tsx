import AgentsPage from "@/components/agents/agents-page/agents-page";

export default function Page() {
  return <AgentsPage demoDate={process.env.MXMT_DEMO_AGENT_DATE} />;
}
