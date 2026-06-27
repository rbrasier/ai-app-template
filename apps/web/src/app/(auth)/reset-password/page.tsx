import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestResetForm } from "./request-reset-form";

export default function ResetPasswordRequestPage() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
      </CardHeader>
      <CardContent>
        <RequestResetForm />
      </CardContent>
    </Card>
  );
}
