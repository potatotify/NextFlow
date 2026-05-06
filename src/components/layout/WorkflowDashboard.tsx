"use client";

import { Clock, Plus, Trash2, X } from "lucide-react";
import type { FC } from "react";

interface WorkflowItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowDashboardProps {
  isOpen: boolean;
  isLoading: boolean;
  workflows: WorkflowItem[];
  onClose: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onCreateNew: () => void;
}

const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();

  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

export const WorkflowDashboard: FC<WorkflowDashboardProps> = ({
  isOpen,
  isLoading,
  workflows,
  onClose,
  onLoad,
  onDelete,
  onCreateNew,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[min(95vw,1000px)] h-[min(95vh,700px)] rounded-3xl bg-[#121212] border border-white/10 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-white/5">
          <div>
            <h2 className="text-3xl font-semibold text-white">My Workflows</h2>
            <p className="text-sm text-neutral-400 mt-1">Manage and organize your workflows</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-white/10 transition-colors text-neutral-400 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin mx-auto mb-3" />
                <p className="text-neutral-400">Loading workflows...</p>
              </div>
            </div>
          ) : workflows.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Plus className="h-8 w-8 text-neutral-600" />
                </div>
                <p className="text-xl font-medium text-white mb-2">No workflows yet</p>
                <p className="text-neutral-400 mb-6">
                  Create your first workflow to get started
                </p>
                <button
                  onClick={onCreateNew}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Create New Workflow
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Create new card */}
              <button
                onClick={onCreateNew}
                className="p-6 rounded-2xl border-2 border-dashed border-neutral-600 hover:border-blue-500 bg-white/5 hover:bg-white/10 transition-all flex flex-col items-center justify-center min-h-40 group"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 group-hover:bg-blue-500/20 flex items-center justify-center mb-3 transition-colors">
                  <Plus className="h-6 w-6 text-neutral-400 group-hover:text-blue-400 transition-colors" />
                </div>
                <p className="font-medium text-neutral-300 group-hover:text-white transition-colors">
                  New Workflow
                </p>
              </button>

              {/* Workflow cards */}
              {workflows.map((wf) => (
                <button
                  key={wf.id}
                  onClick={() => onLoad(wf.id)}
                  className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/8 transition-all group text-left hover:border-blue-500/50 min-h-40 flex flex-col justify-between"
                >
                  {/* Card top - Title */}
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                      {wf.name}
                    </h3>
                  </div>

                  {/* Card bottom - Metadata and delete */}
                  <div className="flex items-end justify-between">
                    <div className="flex items-center gap-1 text-xs text-neutral-500">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formatRelativeTime(wf.updatedAt)}</span>
                    </div>

                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(wf.id, wf.name);
                      }}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity bg-red-600/10 hover:bg-red-600/20 text-red-400 hover:text-red-300 cursor-pointer"
                      role="button"
                      tabIndex={0}
                      aria-label="Delete workflow"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onDelete(wf.id, wf.name);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
