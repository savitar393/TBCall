import { F4Boundary } from "@/features/administration/boundary";
import { FacilityDetail } from "@/features/administration/facilities/detail";
export default async function Page({ params }: {
    params: Promise<{
        facilityId: string;
    }>;
}) {
    const { facilityId } = await params;
    return <F4Boundary kind="facilities" context={facilityId}>
    <FacilityDetail facilityId={facilityId}/>
    </F4Boundary>;
}
