import type { ReactNode } from "react";
import { ProgressLink } from "@/components/progress-link";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex h-14 items-center gap-6">
          <ProgressLink href="/admin" className="font-semibold">
            Admin
          </ProgressLink>
          <nav className="flex gap-4 text-sm">
            <ProgressLink href="/admin/users" className="text-muted-foreground hover:text-foreground">
              Users
            </ProgressLink>
            <ProgressLink href="/admin/roles" className="text-muted-foreground hover:text-foreground">
              Roles
            </ProgressLink>
            <ProgressLink href="/admin/errors" className="text-muted-foreground hover:text-foreground">
              Errors
            </ProgressLink>
            <ProgressLink href="/admin/flags" className="text-muted-foreground hover:text-foreground">
              Flags
            </ProgressLink>
            <ProgressLink href="/admin/usage" className="text-muted-foreground hover:text-foreground">
              Usage
            </ProgressLink>
            <ProgressLink
              href="/admin/settings"
              className="text-muted-foreground hover:text-foreground"
            >
              Settings
            </ProgressLink>
          </nav>
          <div className="ml-auto">
            <ProgressLink href="/" className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to app
            </ProgressLink>
          </div>
        </div>
      </header>
      <div className="container py-8">{children}</div>
    </div>
  );
}
