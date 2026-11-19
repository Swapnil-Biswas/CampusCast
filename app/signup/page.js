import AuthPage from "../../components/auth/AuthPage";

export const metadata = { title: "Create your account · CampusCast" };

export default async function SignUpPage({ searchParams }) {
  const { email } = await searchParams;
  return (
    <AuthPage
      mode="signup"
      title={<>Join the <em>pilot</em>.</>}
      sub="Create your CampusCast account with your college email."
      defaultEmail={typeof email === "string" ? email : ""}
    />
  );
}
