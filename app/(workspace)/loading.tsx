export default function WorkspaceLoading() {
  return (
    <div aria-label="Loading page" className="animate-pulse space-y-6" role="status">
      <span className="sr-only">Loading workspace content…</span>
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="h-8 w-64 max-w-full rounded bg-muted" />
        <div className="h-4 w-80 max-w-full rounded bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="h-28 rounded-xl border border-border bg-card" key={index} />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="h-72 rounded-xl border border-border bg-card" key={index} />
        ))}
      </div>
    </div>
  );
}
