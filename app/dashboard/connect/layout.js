import { ConnectNav } from "../../../components/dashboard/PeopleUI";

// Connect has two halves: the teammate board (posts) and the people directory (student and faculty profiles).
export default function ConnectLayout({ children }) {
  return (<><ConnectNav />{children}</>);
}
