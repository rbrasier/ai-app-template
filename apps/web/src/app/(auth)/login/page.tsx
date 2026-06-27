import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthMethods, safeNext } from "@/lib/auth-methods";
import { AuthForm } from "../auth-form";

// Enabled methods come from the runtime settings store, which reads the DB —
// render per-request rather than prerendering at build time.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const methods = await getAuthMethods();

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardContent>
        <AuthForm methods={methods} mode="sign-in" next={safeNext(next)} />
      </CardContent>
    </Card>
  );
}
