"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

interface NavigationProgressValue {
  readonly anyPending: boolean;
  readonly setLinkPending: (id: string, pending: boolean) => void;
}

const NavigationProgressContext = createContext<NavigationProgressValue | null>(null);

export const useNavigationProgress = (): NavigationProgressValue => {
  const value = useContext(NavigationProgressContext);
  if (!value) {
    throw new Error("useNavigationProgress must be used within NavigationProgressProvider.");
  }
  return value;
};

/**
 * A single 2px bar fixed to the top of the viewport, shown while any
 * ProgressLink reports a pending navigation. It gives immediate feedback during
 * prefetch-before-navigation so a clicked link does not appear stuck.
 */
function NavigationProgressBar() {
  const { anyPending } = useNavigationProgress();
  if (!anyPending) return null;
  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[100] h-[2px] overflow-hidden bg-primary/20"
    >
      <div className="h-full w-1/3 animate-nav-progress bg-primary" />
    </div>
  );
}

export function NavigationProgressProvider({ children }: PropsWithChildren) {
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());

  const setLinkPending = useCallback((id: string, pending: boolean) => {
    setPendingIds((previous) => {
      const alreadyPending = previous.has(id);
      if (pending === alreadyPending) return previous;
      const next = new Set(previous);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo<NavigationProgressValue>(
    () => ({ anyPending: pendingIds.size > 0, setLinkPending }),
    [pendingIds, setLinkPending],
  );

  return (
    <NavigationProgressContext.Provider value={value}>
      {children}
      <NavigationProgressBar />
    </NavigationProgressContext.Provider>
  );
}
