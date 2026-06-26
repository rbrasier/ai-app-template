import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serverEnv } from "@/lib/env";
import { AdminLoginForm, type LoginMethods } from "./login-form";

export default function AdminLoginPage() {
  const env = serverEnv();

  const methods: LoginMethods = {
    emailPassword: env.AUTH_METHOD === "email-password",
    magicLink:
      env.AUTH_METHOD === "magic-link" ||
      env.AUTH_METHOD === "pki-and-magic-link" ||
      env.AUTH_ENABLE_MAGIC_LINK,
    entra: env.AUTH_ENABLE_ENTRA,
    isDev: env.NODE_ENV === "development",
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Admin sign-in</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminLoginForm methods={methods} />
        </CardContent>
      </Card>
    </div>
  );
}
