# StrataFlow Enterprise: Data Management and Encryption Policy
**Effective Date:** November 10, 2025
**Version:** 4.0

## 1. Encryption Standards
Protecting customer data is our highest priority. All Customer Data processed by StrataFlow Enterprise is encrypted both in transit and at rest.
* **In Transit:** All data transmitted over external and internal networks is encrypted using TLS 1.3 or higher. SSL v3 and TLS 1.0/1.1 are explicitly disabled.
* **At Rest:** All databases, object storage buckets (S3), and block storage volumes (EBS) are encrypted using AES-256 encryption. Encryption keys are managed securely via AWS Key Management Service (KMS).

## 2. Hosting Environment
StrataFlow Enterprise production workloads are hosted exclusively on Amazon Web Services (AWS) within the `us-east-1` (Northern Virginia) and `us-west-2` (Oregon) regions. We do not maintain any physical data centers.

## 3. Data Backups and Retention
* Full database backups are performed daily and stored in an isolated, logically separated AWS account.
* Backups are retained for exactly 30 days before being automatically purged.
* Upon termination of a customer contract, all associated Customer Data is hard-deleted from our active production databases within 60 days of the contract termination date.
