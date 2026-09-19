"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, Search, SlidersHorizontal } from "lucide-react";
import { motion } from "motion/react";

import { GlassPanel } from "@/components/glass/glass";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/", label: "Brief", icon: Newspaper },
  { href: "/ask", label: "Ask", icon: Search },
  { href: "/tune", label: "Tune", icon: SlidersHorizontal },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center">
      <div className="pointer-events-auto w-full max-w-[430px] px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
        <GlassPanel className="flex items-center justify-around rounded-[22px] border p-1.5">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href) || isResearch(href, pathname);

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className="relative flex flex-1 flex-col items-center gap-0.5 rounded-[16px] py-2"
              >
                {active && (
                  <motion.div
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-[16px] bg-accent-soft"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon
                  size={19}
                  strokeWidth={active ? 2.4 : 1.9}
                  className={cn("relative", active ? "text-accent" : "text-tertiary")}
                />
                <span
                  className={cn(
                    "relative text-[10px] font-medium tracking-wide",
                    active ? "text-accent" : "text-tertiary",
                  )}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </GlassPanel>
      </div>
    </div>
  );
}

/** A company research sheet is reached from Ask, so keep that tab lit. */
function isResearch(href: string, pathname: string) {
  return href === "/ask" && pathname.startsWith("/c/");
}
