import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-8 text-center">
      <div
        className="glass-tile grid h-14 w-14 place-items-center"
        style={{ background: "var(--surface-sunken)" }}
      >
        <Compass size={22} className="text-tertiary" />
      </div>

      <div>
        <h1 className="text-[17px] font-semibold tracking-display text-primary">Nothing here</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">
          FINN has three screens: the Brief, Ask and Tune.
        </p>
      </div>

      <Link
        href="/"
        className="rounded-xl bg-accent-soft px-4 py-2.5 text-[12.5px] font-semibold text-accent"
      >
        Go to the Brief
      </Link>
    </div>
  );
}
