package id.tbcall.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.*;

@Entity
@Table(name="alert_acknowledgements")
@Getter @Setter @NoArgsConstructor
public class AlertAcknowledgement {
    @Id @GeneratedValue(strategy=GenerationType.UUID) private UUID id;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="alert_id",nullable=false) private Alert alert;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="user_id",nullable=false) private User user;
    @Column(name="acknowledged_at",nullable=false) private OffsetDateTime acknowledgedAt;
    @Column(name="created_at",insertable=false,updatable=false) private OffsetDateTime createdAt;
}
