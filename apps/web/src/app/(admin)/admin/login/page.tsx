import { redirect } from "next/navigation";

// Admin sign-in now lives on the shared front door. Preserve the post-login
// destination so admins land back in the console.
export default function AdminLoginPage() {
  redirect("/login?next=/admin");
}
