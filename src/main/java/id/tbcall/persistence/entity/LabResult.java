package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.DynamicInsert;

@Entity
@Table(name = "lab_results")
@DynamicInsert
@Getter
@Setter
@NoArgsConstructor
public class LabResult {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lab_request_test_id")
    private LabRequestTest labRequestTest;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "specimen_id")
    private LabSpecimen specimen;

    @Column(name = "sequence_no")
    private Integer sequenceNo;

    @Column(name = "tested_at")
    private OffsetDateTime testedAt;

    @Column(name = "result_code", length = 100)
    private String resultCode;

    @Column(name = "result_value", length = 255)
    private String resultValue;

    @Column(name = "result_text", columnDefinition = "text")
    private String resultText;

    @Column(name = "status", length = 30)
    private String status;

    @Column(name = "verified_at")
    private OffsetDateTime verifiedAt;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;
}
