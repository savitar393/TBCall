import { F4Boundary } from "@/features/administration/boundary";
import { IntegrationList } from "@/features/integration/list/workspace";
export default function Page() {
    return <F4Boundary kind="integration" context="integration-list">
    <IntegrationList />
    </F4Boundary>;
}
