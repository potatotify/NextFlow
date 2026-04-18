"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { Cpu, Crop, FileText, Film, GripVertical, ImageIcon, PanelLeft, Search, Sparkles, Video } from "lucide-react";
import { useEffect, useRef, useState, type FC } from "react";

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
      className={`relative flex h-full shrink-0 flex-col border-r border-[#161616] bg-(--nf-sidebar) ${isResizing ? "select-none" : ""} ${collapsed ? "transition-[width] duration-300" : "transition-[width] duration-150"}`}
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
          <div className="absolute inset-y-0 right-0 w-px bg-[#202020]" />
          <div className="absolute inset-y-0 right-0 flex w-2 items-center justify-center opacity-0 transition-opacity hover:opacity-100">
            <GripVertical className="h-4 w-4 text-[#5b5b5b]" />
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
              placeholder="Search nodes"
              className="h-10 w-full rounded-xl border border-[#222222] bg-[#121214] pl-9 pr-3 text-sm text-(--nf-text) outline-none placeholder:text-(--nf-text-secondary) focus:border-[#2f2f2f]"
            />
          </label>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {!collapsed ? (
            <button
              type="button"
              onClick={onLoadSampleWorkflow}
              className="mb-2 flex h-11 items-center gap-3 rounded-xl border border-[#2e2e2e] bg-[#151515] px-3 text-left text-[15px] text-(--nf-text) transition hover:bg-(--nf-hover) hover:text-white"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-[#c8b6ff]" />
              <span className="truncate text-[15px] leading-[1.1]">Load Sample Workflow</span>
            </button>
          ) : null}

          {nodeButtons.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`group flex h-11 items-center rounded-xl border border-transparent text-left text-[15px] leading-[1.1] transition ${collapsed ? "justify-center px-2" : "gap-3 px-3"} bg-transparent text-(--nf-text) hover:bg-(--nf-hover) hover:text-white active:bg-[#2b2b2b]`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("application/nextflow-node-type", id);
                event.dataTransfer.effectAllowed = "move";
              }}
            >
              <Icon className={`shrink-0 text-(--nf-text-secondary) transition group-hover:text-white ${collapsed ? "h-6 w-6" : "h-5 w-5"}`} />
              {!collapsed ? <span className="truncate text-[15px] leading-[1.1]">{label}</span> : null}
            </button>
          ))}
        </div>

        <div className="mt-auto border-t border-[#171717] pt-4">
          <div className="relative">
            {showSignOutConfirm ? (
              <div
                className={`absolute bottom-14 z-30 rounded-2xl border border-[#262626] bg-[#111111] p-3 shadow-2xl ${collapsed ? "left-0 w-56" : "left-2 w-56"}`}
              >
                <p className="text-[13px] font-medium text-(--nf-text)">Sign out?</p>
                <p className="mt-1 text-[12px] text-(--nf-text-secondary)">You can log back in any time.</p>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSignOutConfirm(false)}
                    className="h-8 rounded-lg border border-[#2a2a2a] bg-[#151515] px-3 text-[12px] text-(--nf-text-secondary) hover:text-(--nf-text)"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void clerk.signOut({ redirectUrl: "/sign-in" })}
                    className="h-8 rounded-lg border border-[#4a2328] bg-[#2a1418] px-3 text-[12px] text-[#ffb4be] hover:text-white"
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
