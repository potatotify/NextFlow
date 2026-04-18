"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

interface WorkflowErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function WorkflowError({ error, reset }: WorkflowErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid h-full place-items-center bg-[#0d0f12] px-6">
      <div className="w-full max-w-md rounded-2xl border border-[#2a2a2a] bg-[#121317] p-6 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-[#fca5a5]" />
        <h2 className="mt-3 text-[18px] font-semibold text-[#e5e7eb]">Workflow crashed</h2>
        <p className="mt-2 text-[13px] text-[#9ca3af]">
          Something went wrong while rendering this workflow view. You can try again safely.
        </p>

        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-xl border border-[#333] bg-[#1a1c22] px-4 text-[13px] font-medium text-[#e5e7eb] transition hover:bg-[#22252e]"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
