export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 pt-8 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading">
      <div className="bg-muted h-3 w-32 rounded" />
      <div className="bg-muted mt-3 h-10 w-56 rounded" />
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="bg-card h-64 rounded-2xl border" />
        <div className="bg-card h-64 rounded-2xl border" />
      </div>
    </div>
  );
}
