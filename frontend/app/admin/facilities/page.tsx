import { F4Boundary } from "@/features/administration/boundary";
import { FacilityList } from "@/features/administration/facilities/list";
export default function Page() {
    return <F4Boundary kind="facilities" context="facility-list">
    <FacilityList />
    </F4Boundary>;
}
