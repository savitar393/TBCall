import { F4Boundary } from "@/features/administration/boundary";
import { UserWorkspace } from "@/features/administration/users/workspace";
export default function Page() {
    return <F4Boundary kind="users" context="users">
    <UserWorkspace />
    </F4Boundary>;
}
