import AuthPage from "../../components/auth/AuthPage";
import { ForgotPasswordForm } from "../../components/auth/PasswordForms";

export const metadata = { title: "Forgot password · CampusCast" };

export default async function ForgotPasswordPage({ searchParams }) {
  const { error } = await searchParams;
  return (
    <AuthPage
      eyebrow="Forgot password"
      title={<>Reset your <em>password</em>.</>}
      sub="Enter your college email and we'll send you a code to choose a new password."
    >
      <ForgotPasswordForm
        notice={error === "link" ? "That reset link is invalid or has expired. Request a new one below." : ""}
      />
    </AuthPage>
  );
}
