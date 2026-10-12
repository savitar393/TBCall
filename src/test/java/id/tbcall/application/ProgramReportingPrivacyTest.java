package id.tbcall.application;

import id.tbcall.application.reporting.ReleasePrivacy;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class ProgramReportingPrivacyTest {
    private Map<String,String> cohort(int n,String value) {
        Map<String,String> result=new TreeMap<>();
        for(int i=0;i<n;i++) result.put("fictional-"+i,value);
        return result;
    }
    @Test void zeroIsDifferentFromMissingAndTenSupportsARelease() {
        assertThat(ReleasePrivacy.safe(Map.of(),List.of())).isTrue();
        assertThat(ReleasePrivacy.safe(cohort(10,"province-a/district-a:2,1,1,1,1"),List.of())).isTrue();
        assertThat(ReleasePrivacy.safe(cohort(9,"province-a/district-a:2,1,1,1,1"),List.of())).isFalse();
    }
    @Test void repeatedEpisodesDoNotTurnOnePatientIntoTenContributors() {
        assertThat(ReleasePrivacy.safe(cohort(1,"district-a:100,100,0,100,0"),List.of())).isFalse();
    }
    @Test void rareIntersectionSuppressesTheEntireReleaseEvenWhenMarginalCountsAreLarge() {
        var state=cohort(20,"district-a:1,1,0,1,0");
        state.put("rare-fictional","district-a:2,1,1,1,1");
        assertThat(ReleasePrivacy.safe(state,List.of())).isFalse();
    }
    @Test void smallTransferOrOutcomeChangeCannotBeReleasedAgainstEarlierResults() {
        var before=cohort(20,"district-a:1,1,0,1,0");
        var after=new TreeMap<>(before); after.put("fictional-0","district-b:1,0,1,0,1");
        assertThat(ReleasePrivacy.safe(after,List.of(before))).isFalse();
        assertThat(ReleasePrivacy.safe(before,List.of(before))).isTrue();
    }
    @Test void checksTheWholePublicationTranscriptRatherThanOnlyTheLatestPair() {
        var first=cohort(20,"A"); var second=new TreeMap<>(first); var third=new TreeMap<>(second);
        for(int i=0;i<10;i++) second.put("fictional-"+i,"B");
        for(int i=1;i<=10;i++) third.put("fictional-"+i,"B");
        assertThat(ReleasePrivacy.safe(second,List.of(first))).isTrue();
        assertThat(ReleasePrivacy.safe(third,List.of(first,second))).isFalse();
    }
    @Test void removalsAndUnknownGeographyAreNotIgnored() {
        var before=cohort(10,"UNKNOWN:1,0,0,0,0");
        var after=new TreeMap<>(before); after.remove("fictional-0");
        assertThat(ReleasePrivacy.safe(after,List.of(before))).isFalse();
    }
}
