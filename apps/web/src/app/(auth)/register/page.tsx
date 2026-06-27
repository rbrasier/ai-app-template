import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthMethods, safeNext } from "@/lib/auth-methods";
import { AuthForm } from "../auth-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const methods = await getAuthMethods();

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
      </CardHeader>
      <CardContent>
        <AuthForm methods={methods} mode="sign-up" next={safeNext(next)} />
      </CardContent>
    </Card>
  );
}
