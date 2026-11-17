export function ScenarioPreviewStatus({ prerequisite, busy, ready, copy }: {
  prerequisite?: string;
  busy: boolean;
  ready: boolean;
  copy: { updating: string; ready: string };
}) {
  const message = prerequisite ?? (busy ? copy.updating : ready ? copy.ready : "");
  return (
    <p role="status" aria-live="polite" className="text-sm text-(--muted)">
      {message}
    </p>
  );
}
