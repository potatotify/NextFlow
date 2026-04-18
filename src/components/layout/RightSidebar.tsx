"use client";

import { ChevronLeft, ChevronRight, History } from "lucide-react";
import type { FC } from "react";

import { HistoryPanel } from "@/components/history/HistoryPanel";

interface RightSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const RightSidebar: FC<RightSidebarProps> = ({ collapsed, onToggle }) => {
  return (
    <aside
      className={`relative flex h-full shrink-0 flex-col border-l border-(--nf-border) bg-(--nf-panel) transition-[width] duration-300 ${collapsed ? "w-14" : "w-71.5"}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="absolute -left-3 top-4 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-(--nf-border) bg-(--nf-surface) text-(--nf-text-secondary) hover:text-(--nf-text)"
        aria-label={collapsed ? "Expand right sidebar" : "Collapse right sidebar"}
      >
        {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {collapsed ? (
        <div className="flex h-full items-start justify-center pt-4">
          <History className="h-4 w-4 text-(--nf-text-secondary)" />
        </div>
      ) : (
        <HistoryPanel />
      )}
    </aside>
  );
};
