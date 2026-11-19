import AuthPage from "../../components/auth/AuthPage";

export const metadata = { title: "Sign in · CampusCast" };

export default async function SignInPage({ searchParams }) {
  const { error } = await searchParams;
  return (
    <AuthPage
      mode="signin"
      title={<>Sign <em>in</em>.</>}
      sub="Pick up your feed where you left it."
      notice={error === "link" ? "That confirmation link is invalid or has expired. Try signing in, or sign up again." : ""}
    />
  );
}
