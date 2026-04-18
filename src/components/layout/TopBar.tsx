"use client";

import { ChevronDown, Download, Play, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FC } from "react";

interface TopBarProps {
  workflowName: string;
  onWorkflowNameChange: (value: string) => void;
  onExportWorkflow: () => void;
  onImportWorkflow: (file: File) => void;
  isExporting: boolean;
  isImporting: boolean;
}

export const TopBar: FC<TopBarProps> = ({
  workflowName,
  onWorkflowNameChange,
  onExportWorkflow,
  onImportWorkflow,
  isExporting,
  isImporting,
}) => {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const titleWidthCh = Math.max(8, Math.min(18, workflowName.trim().length || 8));

  const handleImportClick = useCallback(() => {
    importInputRef.current?.click();
    setIsMenuOpen(false);
  }, []);

  const handleExportClick = useCallback(() => {
    onExportWorkflow();
    setIsMenuOpen(false);
  }, [onExportWorkflow]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20">
      <div ref={menuRef} className="absolute left-4 top-4 pointer-events-auto">
        <div className="flex h-14.5 items-center rounded-xl border border-(--nf-border) bg-(--nf-surface) py-2.5 pl-2.5 pr-3.5 shadow-md">
          <button
            type="button"
            onClick={() => setIsMenuOpen((value) => !value)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-(--nf-text) hover:bg-(--nf-hover)"
            aria-label="Open workflow menu"
            aria-expanded={isMenuOpen}
          >
            <svg aria-label="Krea Logo" width="19" height="19" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="text-(--nf-text) will-change-transform">
              <path d="M8.34 1.266c1.766-.124 3.324 1.105 3.551 2.802.216 1.612-.887 3.171-2.545 3.536-.415.092-.877.066-1.317.122a4.63 4.63 0 0 0-2.748 1.34l-.008.004-.01-.001-.006-.005-.003-.009q0-.009.005-.016a.04.04 0 0 0 .007-.022 438 438 0 0 1-.01-4.541c.003-1.68 1.33-3.086 3.085-3.21"></path>
              <path d="M8.526 15.305c-2.247-.018-3.858-2.23-3.076-4.3a3.31 3.31 0 0 1 2.757-2.11c.384-.04.845-.03 1.215-.098 1.9-.353 3.368-1.806 3.665-3.657.066-.41.031-.9.128-1.335.449-2.016 2.759-3.147 4.699-2.236 1.011.476 1.69 1.374 1.857 2.447q.051.33.034.818c-.22 5.842-5.21 10.519-11.279 10.47m2.831.93a.04.04 0 0 1-.021-.02l-.001-.006.002-.006q0-.003.003-.004l.006-.003q3.458-.792 5.992-3.185.045-.042.083.007c.27.357.554.74.78 1.106a10.6 10.6 0 0 1 1.585 4.89q.037.53.023.819c-.084 1.705-1.51 3.08-3.31 3.09-1.592.01-2.992-1.077-3.294-2.597-.072-.36-.05-.858-.11-1.238q-.282-1.755-1.715-2.84zm-3.369 6.64c-1.353-.235-2.441-1.286-2.684-2.593a5 5 0 0 1-.05-.817V15.14q0-.021.016-.007c.884.786 1.814 1.266 3.028 1.346l.326.01c1.581.051 2.92 1.087 3.229 2.592.457 2.225-1.557 4.195-3.865 3.793"></path>
            </svg>
              <ChevronDown className={`h-4 w-4 text-(--nf-text) transition-transform duration-150 ${isMenuOpen ? "rotate-180" : ""}`} />
          </button>

          <div className="flex items-center">
            <input
              type="text"
              value={workflowName}
              onChange={(event) => onWorkflowNameChange(event.target.value)}
              style={{ width: `${titleWidthCh}ch` }}
              className="h-8 min-w-[8ch] max-w-[18ch] truncate rounded-md border border-transparent bg-transparent px-2 text-base font-[450] text-(--nf-text) outline-none focus:border-(--nf-border)"
              aria-label="Workflow name"
            />
          </div>
        </div>

        {isMenuOpen ? (
          <div className="pointer-events-auto absolute left-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-lg border border-(--nf-border) bg-(--nf-surface) p-2 shadow-[0_2px_6px_0_rgba(0,0,0,0.24)]">
            <button
              type="button"
              onClick={handleImportClick}
              disabled={isImporting}
              className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-xs font-medium text-(--nf-text) hover:bg-(--nf-hover)"
            >
              <Upload className="h-4 w-4 text-(--nf-text-secondary)" strokeWidth={2.2} />
              Import
            </button>
            <button
              type="button"
              onClick={handleExportClick}
              disabled={isExporting}
              className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-xs font-medium text-(--nf-text) hover:bg-(--nf-hover)"
            >
              <Download className="h-4 w-4 text-(--nf-text-secondary)" strokeWidth={2.2} />
              Export
            </button>
          </div>
        ) : null}
      </div>

      <div className="absolute right-3 top-2 flex items-center gap-2 pointer-events-auto">
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          disabled={isImporting}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            onImportWorkflow(file);
            event.currentTarget.value = "";
          }}
        />
      </div>
    </header>
  );
};
