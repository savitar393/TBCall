package id.tbcall.application.reporting;

import id.tbcall.application.common.ApplicationFailure;
import java.sql.ResultSet;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;
import static id.tbcall.application.reporting.ReportingDtos.*;

@Repository
public class ReportingStore {
    private final JdbcTemplate jdbc;
    private final JsonMapper json=JsonMapper.builder().build();
    public ReportingStore(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    /** One consistent query; correlated episode counts prevent case/treatment/outcome join multiplication. */
    public Snapshot capture(UUID actor,long sequence) {
        // Shared database capture time is descriptive; durable capture order governs freshness.
        OffsetDateTime now=jdbc.queryForObject("select clock_timestamp()",OffsetDateTime.class);
        Map<String,Accumulator> cells=new LinkedHashMap<>();
        cells.put("NATIONAL:",new Accumulator(new Geography("NATIONAL",null,"Indonesia — rekaman TBCall teratribusi")));
        jdbc.query("select level,code,name from reporting_regions where catalogue_version=? order by level,code",
                (rs,i)->new Geography(rs.getString(1),rs.getString(2),rs.getString(3)),ReportingCatalogue.VERSION)
                .forEach(g -> cells.put(key(g),new Accumulator(g)));
        Map<String,List<List<Object>>> privateRows=new TreeMap<>();
        long[] unattributed={0};
        jdbc.query("""
                select r.patient_id,f.id facility_id,g.code,g.parent_code,
                    count(*) episodes,count(*) filter(where c.status='ACTIVE') active,
                    count(*) filter(where c.status='COMPLETED') completed,
                    sum((select count(*) from treatments t where t.case_id=c.id and t.status='ACTIVE')) treatments,
                    sum((select count(*) from treatment_outcomes o join treatments t on t.id=o.treatment_id where t.case_id=c.id)) outcomes
                from tb_cases c join tb_registrations r on r.id=c.registration_id
                    join facilities f on f.id=c.current_facility_id
                    left join reporting_regions g on g.catalogue_version=? and g.level='REGENCY'
                        and g.code=f.regency_code and g.parent_code=f.province_code
                group by r.patient_id,f.id,g.code,g.parent_code order by r.patient_id,f.id
                """,rs -> {
            String patient=ReportingCatalogue.digest(rs.getString("patient_id")),facility=rs.getString("facility_id"),region=rs.getString("code");
            long cases=rs.getLong("episodes"),active=rs.getLong("active"),completed=rs.getLong("completed"),treatments=rs.getLong("treatments"),outcomes=rs.getLong("outcomes");
            privateRows.computeIfAbsent(patient,p -> new ArrayList<>()).add(List.of(region==null?"UNATTRIBUTED":region,facility,cases,active,completed,treatments,outcomes));
            if(region==null) { unattributed[0]+=cases; return; }
            for(String location:List.of("NATIONAL:","PROVINCE:"+rs.getString("parent_code"),"REGENCY:"+region))
                cells.get(location).add(facility,cases,active,completed,treatments,outcomes);
        },ReportingCatalogue.VERSION);
        Map<String,String> contributions=new TreeMap<>();
        privateRows.forEach((patient,rows) -> contributions.put(patient,json.writeValueAsString(rows)));
        Release release=new Release(cells.values().stream().map(Accumulator::cell).toList(),unattributed[0]);
        UUID id=UUID.randomUUID();
        jdbc.update("""
                insert into reporting_snapshots(id,catalogue_version,state,data_as_of,capture_sequence,created_by,created_at,public_data,private_contributions)
                values (?,?,'DRAFT',?,?,?,?,?::jsonb,?::jsonb)
                """,id,ReportingCatalogue.VERSION,now,sequence,actor,now,json.writeValueAsString(release),json.writeValueAsString(contributions));
        advanceSequence(sequence);
        return new Snapshot(new Candidate(id,0,"DRAFT",now,ReportingCatalogue.VERSION),release,Map.copyOf(contributions));
    }
    public Candidate candidate(UUID id,boolean lock) {
        var found=jdbc.query("select id,version,state,data_as_of,catalogue_version from reporting_snapshots where id=?"+(lock?" for update":""),
                (rs,i)->candidate(rs),id);
        if(found.isEmpty()) throw ApplicationFailure.missing();
        return found.getFirst();
    }
    private Candidate candidate(ResultSet rs) throws java.sql.SQLException {
        return new Candidate(rs.getObject("id",UUID.class),rs.getLong("version"),rs.getString("state"),rs.getObject("data_as_of",OffsetDateTime.class),rs.getString("catalogue_version"));
    }
    public Map<String,String> contributions(UUID id) {
        String raw=jdbc.queryForObject("select private_contributions::text from reporting_snapshots where id=?",String.class,id);
        return json.readValue(raw,json.getTypeFactory().constructMapType(TreeMap.class,String.class,String.class));
    }
    public List<Map<String,String>> priorContributions() {
        return jdbc.query("select private_contributions::text from reporting_snapshots where state='PUBLISHED' order by published_sequence",
                (rs,i)->json.<Map<String,String>>readValue(rs.getString(1),json.getTypeFactory().constructMapType(TreeMap.class,String.class,String.class)));
    }
    public long lockPublications() { return jdbc.queryForObject("select sequence from reporting_publication_guard where id=1 for update",Long.class); }
    public boolean newerThanPublished(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                select not exists(select 1 from reporting_snapshots published,reporting_snapshots candidate
                    where candidate.id=? and published.state='PUBLISHED'
                    and published.capture_sequence>=candidate.capture_sequence)
                """,Boolean.class,id));
    }
    private void advanceSequence(long sequence) { jdbc.update("update reporting_publication_guard set sequence=? where id=1",sequence); }
    public void publish(Candidate candidate,UUID actor,OffsetDateTime now,long sequence) {
        jdbc.update("""
                update reporting_snapshots set state='PUBLISHED',version=version+1,published_by=?,published_at=?,published_sequence=?
                where id=? and state='DRAFT' and version=?
                """,actor,now,sequence,candidate.id(),candidate.version());
        advanceSequence(sequence);
    }
    public Candidate latest() {
        var found=jdbc.query("select id,version,state,data_as_of,catalogue_version from reporting_snapshots where state='PUBLISHED' order by published_sequence desc limit 1",(rs,i)->candidate(rs));
        if(found.isEmpty()) throw new ApplicationFailure(503,"REPORT_NOT_PUBLISHED","Laporan belum tersedia","Belum ada snapshot yang disetujui untuk publikasi.");
        return found.getFirst();
    }
    /** The caller has locked and authorized this geography; SQL selects only its fixed cells. */
    public Cell summary(UUID snapshot,Geography geography) {
        return jdbc.queryForObject("""
                select cell::text from reporting_snapshots s cross join lateral jsonb_array_elements(s.public_data->'cells') cell
                where s.id=? and s.state='PUBLISHED' and cell->'geography'->>'scope'=?
                    and coalesce(cell->'geography'->>'code','')=?
                """,(rs,i)->json.readValue(rs.getString(1),Cell.class),snapshot,geography.scope(),geography.code()==null?"":geography.code());
    }
    public List<Cell> children(UUID snapshot,Geography geography) {
        if(geography.scope().equals("REGENCY")) return List.of();
        return jdbc.query("""
                select cell::text from reporting_snapshots s cross join lateral jsonb_array_elements(s.public_data->'cells') cell
                join reporting_regions r on r.catalogue_version=s.catalogue_version
                    and r.code=cell->'geography'->>'code' and r.level=cell->'geography'->>'scope'
                where s.id=? and s.state='PUBLISHED' and
                    ((?='NATIONAL' and r.level='PROVINCE') or (?='PROVINCE' and r.level='REGENCY' and r.parent_code=?))
                order by r.code
                """,(rs,i)->json.readValue(rs.getString(1),Cell.class),snapshot,geography.scope(),geography.scope(),geography.code());
    }
    public long unattributed(UUID snapshot) {
        return jdbc.queryForObject("select (public_data->>'unattributedCaseEpisodes')::bigint from reporting_snapshots where id=? and state='PUBLISHED'",Long.class,snapshot);
    }
    public List<Source> sources() {
        return List.of(json.readValue(jdbc.queryForObject("select source_manifest::text from reporting_catalogues where version=?",String.class,ReportingCatalogue.VERSION),Source[].class));
    }
    static String key(Geography g) { return g.scope()+":"+(g.code()==null?"":g.code()); }
    private static final class Accumulator {
        private final Geography geography; private final Set<String> facilities=new HashSet<>();
        private long cases,active,completed,treatments,outcomes;
        Accumulator(Geography geography) { this.geography=geography; }
        void add(String facility,long cases,long active,long completed,long treatments,long outcomes) {
            facilities.add(facility); this.cases+=cases; this.active+=active; this.completed+=completed; this.treatments+=treatments; this.outcomes+=outcomes;
        }
        Cell cell() { return new Cell(geography,new Indicators(cases,active,completed,treatments,outcomes,facilities.size())); }
    }
}
