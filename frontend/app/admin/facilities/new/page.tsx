import { F4Boundary } from "@/features/administration/boundary";
import { FacilityCreate } from "@/features/administration/facilities/create";
export default function Page() {
    return <F4Boundary kind="facilities" context="facility-create">
    <FacilityCreate />
    </F4Boundary>;
}
