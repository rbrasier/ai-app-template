"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect, useId, type ComponentProps } from "react";
import { useNavigationProgress } from "./navigation-progress";

// Must render inside a <Link>; useLinkStatus reads that link's pending state.
function LinkStatusReporter({ id }: { id: string }) {
  const { pending } = useLinkStatus();
  const { setLinkPending } = useNavigationProgress();

  useEffect(() => {
    setLinkPending(id, pending);
    return () => setLinkPending(id, false);
  }, [id, pending, setLinkPending]);

  return null;
}

/**
 * Drop-in replacement for next/link that feeds the shared NavigationProgress
 * bar. Use it for navigations where the 2px top indicator should appear.
 */
export function ProgressLink({ children, ...props }: ComponentProps<typeof Link>) {
  const id = useId();
  return (
    <Link {...props}>
      {children}
      <LinkStatusReporter id={id} />
    </Link>
  );
}
