export function AuthFormError({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-(--error-text)">
      {message}
    </div>
  );
}
