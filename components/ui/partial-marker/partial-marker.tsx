export function PartialMarker({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true"> *</span>
      <span className="sr-only"> {label}</span>
    </>
  );
}
