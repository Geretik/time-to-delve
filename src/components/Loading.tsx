export function PageLoading({ label = "Načítám…" }: { label?: string }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <p className="animate-pulse text-sm text-muted">{label}</p>
    </div>
  );
}
