import { F4Boundary } from "@/features/administration/boundary";
import { IntegrationRun } from "@/features/integration/run/workspace";
export default async function Page({ params }: {
    params: Promise<{
        code: string;
        runId: string;
    }>;
}) {
    const { code, runId } = await params;
    return <F4Boundary kind="integration" context={`${code}/${runId}`}>
    <IntegrationRun code={code} runId={runId}/>
    </F4Boundary>;
}
