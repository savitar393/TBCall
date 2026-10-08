import { F4Boundary } from "@/features/administration/boundary";
import { IntegrationDetail } from "@/features/integration/detail/workspace";
export default async function Page({ params }: {
    params: Promise<{
        code: string;
    }>;
}) {
    const { code } = await params;
    return <F4Boundary kind="integration" context={code}>
    <IntegrationDetail code={code}/>
    </F4Boundary>;
}
