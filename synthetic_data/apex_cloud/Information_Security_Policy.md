# ApexCloud Solutions: Information Security Policy (ISP)
**Document Version:** 2.1
**Last Updated:** January 15, 2026
**Confidentiality Level:** Internal / Under NDA

## 1. Purpose
This policy outlines the security baseline for all ApexCloud Solutions information systems, data, and personnel to ensure the confidentiality, integrity, and availability of customer data.

## 2. Identity and Access Management (IAM)
* **Role-Based Access Control (RBAC):** All access to production systems and customer data is strictly governed by RBAC, adhering to the principle of least privilege.
* **Authentication:** Multi-Factor Authentication (MFA) is strictly enforced for all employee access to corporate networks, infrastructure, and third-party tools.
* **Access Reviews:** User access rights are reviewed on a quarterly basis by department heads and the IT Security team. Unnecessary privileges are revoked immediately.
* **Offboarding:** Access for terminated employees is revoked immediately (within 1 hour of termination).

## 3. Data Security and Encryption
* **Data at Rest:** All customer data stored in ApexCloud databases is encrypted using AES-256 encryption.
* **Data in Transit:** All data transmitted over public networks is encrypted using TLS 1.2 or higher.
* **Data Segregation:** Customer data is logically segregated within our multi-tenant cloud architecture using unique tenant IDs.
* **Key Management:** Encryption keys are managed via AWS Key Management Service (KMS). Keys are rotated annually, and access to key management functions is strictly limited to authorized security personnel.

## 4. Human Resources Security
* **Background Checks:** All employees and contractors must undergo standard criminal background checks prior to employment.
* **Security Training:** All personnel must complete security awareness training upon hire and annually thereafter. Training includes phishing awareness, data privacy (GDPR/CCPA), and password hygiene.