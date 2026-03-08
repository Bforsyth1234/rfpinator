# ApexCloud Solutions: BCDR Policy
**Document Version:** 3.0
**Last Updated:** February 02, 2026
**Confidentiality Level:** Internal / Under NDA

## 1. Strategy and Architecture
ApexCloud relies on highly available cloud infrastructure hosted in AWS. Our primary region is US-East-1, with automated failover configured for our secondary region, US-West-2, to ensure geographic redundancy.

## 2. Recovery Objectives
* **Recovery Time Objective (RTO):** 4 hours. (The maximum acceptable time the application can be offline).
* **Recovery Point Objective (RPO):** 1 hour. (The maximum acceptable amount of data loss, mitigated by continuous database replication).

## 3. Backups
* **Frequency:** Full database backups are taken daily. Incremental backups are taken hourly.
* **Storage:** Backups are stored in an isolated, immutable storage bucket in a geographically distinct region from the primary data source.
* **Retention:** Backups are retained for 30 days.
* **Testing:** Disaster recovery failover and backup restoration are tested bi-annually (every 6 months).

## 4. Continuity of Operations
In the event of a localized facility disaster (e.g., corporate office outage), all ApexCloud employees are equipped and authorized to work securely from remote locations to maintain customer support and operational uptime.