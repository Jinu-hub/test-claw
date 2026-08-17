import { Text } from "@cloudflare/kumo";
import { CircleNotchIcon } from "@phosphor-icons/react";
import type { BackgroundJob } from "../types";

export function BackgroundJobsBar({ jobs }: { jobs: BackgroundJob[] }) {
  if (jobs.length === 0) return null;

  return (
    <div className="px-5 py-2 bg-kumo-base border-b border-kumo-line">
      <div className="max-w-3xl mx-auto space-y-2">
        {jobs.map((job) => (
          <div
            key={job.key}
            className="rounded-lg border border-kumo-line bg-kumo-control/40 px-3 py-2"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <CircleNotchIcon
                  size={14}
                  className="animate-spin text-kumo-brand shrink-0"
                />
                <div className="truncate">
                  <Text size="xs">
                    <span className="font-medium">{job.label}</span>
                    <span className="text-kumo-subtle"> · {job.detail}</span>
                  </Text>
                </div>
              </div>
              <div className="shrink-0">
                <Text size="xs" variant="secondary">
                  {Math.round(job.percent * 100)}%
                </Text>
              </div>
            </div>
            <div className="mt-2 h-1 rounded-full bg-kumo-line overflow-hidden">
              <div
                className="h-full bg-kumo-brand transition-[width] duration-300 ease-out"
                style={{ width: `${Math.max(4, job.percent * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
