import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getViewer } from "@/lib/auth";

export default async function SignupPage() {
  if (await getViewer()) redirect("/");
  return <AuthForm mode="signup" />;
}
