/**
 * Shown while the sheet resolves. For an ingested ticker this is a flash; for
 * a live fetch it can be several seconds, since four transcript PDFs have to
 * be downloaded and parsed before the page can render.
 */
export default function ResearchLoading() {
  return (
    <div className="space-y-5 px-4 pt-[max(16px,env(safe-area-inset-top))]">
      <div className="flex items-center gap-3">
        <div className="skeleton h-8 w-8 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <div className="skeleton h-4 w-2/3 rounded" />
          <div className="skeleton h-2.5 w-1/2 rounded" />
        </div>
      </div>

      <div className="skeleton h-[42px] rounded-xl" />

      <div className="space-y-2">
        <div className="skeleton h-3 w-28 rounded" />
        <div className="skeleton h-[84px] rounded-[18px]" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[52px] rounded-xl" />
        ))}
      </div>

      <div className="space-y-2">
        <div className="skeleton h-3 w-32 rounded" />
        <div className="skeleton h-[180px] rounded-[18px]" />
      </div>

      <p className="pt-1 text-center text-[11px] text-tertiary">
        Reading filings, financial statements and concall transcripts…
      </p>
    </div>
  );
}
