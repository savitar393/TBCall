package id.tbcall.application.laboratory;

import java.util.List;
import id.tbcall.application.laboratory.LabDtos.Label;

/** Laboratory reference options only; no entities, descriptions or clinical data. */
public final class LabReferenceDtos {
    private LabReferenceDtos() {}

    public record ReferenceData(List<Label> testTypes,List<Label> requestReasons,List<Label> requestStatuses,
            List<Label> ownerTypes,List<Label> referralTypes,List<Label> testStatuses,List<Label> resultStatuses) {}
}
