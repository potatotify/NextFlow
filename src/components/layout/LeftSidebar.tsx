"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { Cpu, Crop, FileText, Film, GripVertical, ImageIcon, PanelLeft, Search, Sparkles, Video } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FC } from "react";

interface LeftSidebarProps {
  collapsed: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  onToggle: () => void;
  onLoadSampleWorkflow: () => void;
}

interface NodeButton {
  id: string;
  label: string;
  icon: FC<{ className?: string }>;
}

const nodeButtons: NodeButton[] = [
  { id: "textNode", label: "Text Node", icon: FileText },
  { id: "uploadImageNode", label: "Upload Image", icon: ImageIcon },
  { id: "uploadVideoNode", label: "Upload Video", icon: Video },
  { id: "llmNode", label: "Run Any LLM", icon: Cpu },
  { id: "cropImageNode", label: "Crop Image", icon: Crop },
  { id: "extractFrameNode", label: "Extract Frame", icon: Film },
];

const MIN_WIDTH = 240;
const MAX_WIDTH = 420;

export const LeftSidebar: FC<LeftSidebarProps> = ({ collapsed, width, onWidthChange, onToggle, onLoadSampleWorkflow }) => {
  const clerk = useClerk();
  const { user } = useUser();
  const displayName = user?.fullName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress ?? "Account";
  const avatarUrl = user?.imageUrl ?? "";
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(width);
  const [isResizing, setIsResizing] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [nodeSearchText, setNodeSearchText] = useState("");

  const visibleNodeButtons = useMemo(() => {
    const query = nodeSearchText.trim().toLowerCase();
    if (!query) return nodeButtons;

    return nodeButtons.filter(({ id, label }) => {
      return label.toLowerCase().includes(query) || id.toLowerCase().includes(query);
    });
  }, [nodeSearchText]);

  useEffect(() => {
    if (!isResizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = resizeStartWidthRef.current + (event.clientX - resizeStartXRef.current);
      onWidthChange(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, nextWidth)));
    };

    const handlePointerUp = () => {
      setIsResizing(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizing, onWidthChange]);

  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (collapsed) return;

    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = width;
    setIsResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  return (
    <aside
      style={{ width: collapsed ? 58 : width }}
      className={`relative flex h-full shrink-0 flex-col border-r border-(--nf-border) bg-(--nf-sidebar) ${isResizing ? "select-none" : ""} ${collapsed ? "transition-[width] duration-300" : "transition-[width] duration-150"}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`absolute top-3 z-20 grid h-7 w-7 place-items-center rounded-md bg-transparent text-(--nf-text-secondary) hover:text-(--nf-text) ${collapsed ? "left-1/2 -translate-x-1/2" : "left-3"}`}
        aria-label={collapsed ? "Expand left sidebar" : "Collapse left sidebar"}
      >
        <PanelLeft className="h-5 w-5" />
      </button>

      {!collapsed ? (
        <div
          role="presentation"
          onPointerDown={handleResizePointerDown}
          className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize touch-none"
        >
          <div className="absolute inset-y-0 right-0 w-px bg-(--nf-border)" />
          <div className="absolute inset-y-0 right-0 flex w-2 items-center justify-center opacity-0 transition-opacity hover:opacity-100">
            <GripVertical className="h-4 w-4 text-(--nf-text-secondary)" />
          </div>
        </div>
      ) : null}

      <div className="flex h-full flex-col gap-4 px-3 pb-4 pt-12">
        <h2 className="px-2 text-xs font-medium text-(--nf-text-secondary)">
          {collapsed ? "" : "Quick Access"}
        </h2>

        {!collapsed ? (
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--nf-text-secondary)" />
            <input
              type="text"
              value={nodeSearchText}
              onChange={(event) => setNodeSearchText(event.target.value)}
              placeholder="Search nodes"
              className="h-10 w-full rounded-xl border border-(--nf-input-border) bg-(--nf-input-bg) pl-9 pr-3 text-sm text-(--nf-text) outline-none placeholder:text-(--nf-text-secondary) focus:border-(--nf-input-focus)"
            />
          </label>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {!collapsed ? (
            <button
              type="button"
              onClick={onLoadSampleWorkflow}
              className="mb-2 flex h-11 items-center gap-3 rounded-xl border border-(--nf-border) bg-(--nf-surface) px-3 text-left text-[15px] text-(--nf-text) transition hover:bg-(--nf-hover)"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-(--nf-text-secondary)" />
              <span className="truncate text-[15px] leading-[1.1]">Load Sample Workflow</span>
            </button>
          ) : null}

          {visibleNodeButtons.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`group flex h-11 items-center rounded-xl border border-transparent bg-transparent text-left text-[15px] leading-[1.1] text-(--nf-text) transition ${collapsed ? "justify-center px-2" : "gap-3 px-3"} hover:bg-(--nf-hover) active:bg-(--nf-hover)`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("application/nextflow-node-type", id);
                event.dataTransfer.effectAllowed = "move";
              }}
            >
              <Icon className={`shrink-0 text-(--nf-text-secondary) transition group-hover:text-(--nf-text) ${collapsed ? "h-6 w-6" : "h-5 w-5"}`} />
              {!collapsed ? <span className="truncate text-[15px] leading-[1.1]">{label}</span> : null}
            </button>
          ))}

          {!collapsed && visibleNodeButtons.length === 0 ? (
            <p className="px-3 py-2 text-[13px] text-(--nf-text-secondary)">No matching nodes.</p>
          ) : null}
        </div>

        <div className="mt-auto border-t border-(--nf-border) pt-4">
          <div className="relative">
            {showSignOutConfirm ? (
              <div
                className={`absolute bottom-14 z-30 rounded-2xl border border-(--nf-border) bg-(--nf-panel) p-3 shadow-2xl ${collapsed ? "left-0 w-56" : "left-2 w-56"}`}
              >
                <p className="text-[13px] font-medium text-(--nf-text)">Sign out?</p>
                <p className="mt-1 text-[12px] text-(--nf-text-secondary)">You can log back in any time.</p>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSignOutConfirm(false)}
                    className="h-8 rounded-lg border border-(--nf-border) bg-(--nf-surface) px-3 text-[12px] text-(--nf-text-secondary) hover:text-(--nf-text)"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void clerk.signOut({ redirectUrl: "/sign-in" })}
                    className="h-8 rounded-lg border border-(--nf-danger-border) bg-(--nf-danger-bg) px-3 text-[12px] text-(--nf-danger-text) hover:brightness-95"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            ) : null}

            <div className={`${collapsed ? "flex justify-center" : "flex items-center gap-3 px-2 py-2 text-left"}`}>
              <button
                type="button"
                onClick={() => setShowSignOutConfirm((value) => !value)}
                className="relative h-9 w-9 shrink-0 overflow-hidden rounded-2xl bg-transparent ring-0 outline-none transition hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-white/20"
                aria-label="Open sign out confirmation"
                title="Account"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="h-full w-full object-cover object-center"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
              </button>

              {!collapsed ? (
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium leading-none text-(--nf-text)">{displayName}</p>
                  <p className="mt-1 text-[12px] text-(--nf-text-secondary)">Free</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
