import Nav from "./Nav";
import AuthNav from "./AuthNav";

// The site nav with the sign-in area filled in. Use this on every page that needs login state.
export default function SiteNav() {
  return (
    <Nav>
      <AuthNav />
    </Nav>
  );
}
