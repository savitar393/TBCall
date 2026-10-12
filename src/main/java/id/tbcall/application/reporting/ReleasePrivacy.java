package id.tbcall.application.reporting;

import java.util.*;

/**
 * Conservative GA-1 whole-release complementary suppression: no numeric publication
 * unless every nonempty patient contribution trajectory has at least ten members.
 * Each contribution includes leaf geography, facility and the complete indicator vector.
 * Identical vectors support all fixed sums/intersections and their parent complements;
 * including EVERY previously published vector also tests temporal composition.
 * This prototype guard is not differential privacy, anonymity or legal certification.
 */
public final class ReleasePrivacy {
    public static final int MINIMUM_PATIENTS=10;
    private ReleasePrivacy() {}
    public static boolean safe(Map<String,String> candidate,List<Map<String,String>> priorReleases) {
        Set<String> patients=new TreeSet<>(candidate.keySet());
        priorReleases.forEach(release -> patients.addAll(release.keySet()));
        Map<List<String>,Integer> groups=new HashMap<>();
        for(String patient:patients) {
            List<String> trajectory=new ArrayList<>();
            for(var prior:priorReleases) trajectory.add(prior.getOrDefault(patient,""));
            trajectory.add(candidate.getOrDefault(patient,""));
            groups.merge(List.copyOf(trajectory),1,Integer::sum);
        }
        return groups.values().stream().allMatch(count -> count>=MINIMUM_PATIENTS);
    }
}
