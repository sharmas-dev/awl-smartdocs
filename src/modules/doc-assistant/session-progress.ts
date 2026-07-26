/** Compact variable shape returned to the LLM in progress / pending-group payloads. */
export type SessionProgressVariable = {
    key: string;
    label: string;
    type: string;
    required: boolean;
    options?: string[];
    condition?: { field: string; equals: string | boolean };
};

export type SessionProgressGroup = {
    id: string;
    label: string;
    variables: SessionProgressVariable[];
};

export type SessionProgress =
    | {
          allComplete: true;
          totalCollected: number;
          completedGroups: string[];
          missingFieldKeys: [];
      }
    | {
          allComplete: false;
          totalCollected: number;
          completedGroups: string[];
          missingFieldKeys: string[];
          group: SessionProgressGroup;
          groupIndex: number;
          totalGroups: number;
          completedCount: number;
      };

export type SessionProgressError = { error: string };

export function isSessionProgressComplete(
    progress: SessionProgress | SessionProgressError,
): progress is Extract<SessionProgress, { allComplete: true }> {
    return 'allComplete' in progress && progress.allComplete === true;
}

export function sessionProgressToNextGroupResult(
    progress: SessionProgress | SessionProgressError,
):
    | { group: SessionProgressGroup; groupIndex: number; totalGroups: number; completedCount: number }
    | { allComplete: true; totalCollected: number }
    | { error: string } {
    if ('error' in progress) {
        return { error: progress.error };
    }
    if (progress.allComplete) {
        return { allComplete: true, totalCollected: progress.totalCollected };
    }
    return {
        group: progress.group,
        groupIndex: progress.groupIndex,
        totalGroups: progress.totalGroups,
        completedCount: progress.completedCount,
    };
}
