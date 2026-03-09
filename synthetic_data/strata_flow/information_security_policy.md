# StrataFlow Enterprise: Information Security Policy
**Effective Date:** January 1, 2026
**Version:** 3.2

## 1. Access Control
Access to StrataFlow Enterprise systems and customer data is strictly governed by Role-Based Access Control (RBAC). All employee access requires authentication via our centralized Identity Provider (Okta SSO). 
* Multi-Factor Authentication (MFA) is enforced globally for all internal systems, VPNs, and third-party SaaS applications used by the company.
* Access privileges are reviewed quarterly by the Security and Compliance team.

## 2. Password Requirements
For legacy systems that do not yet support SSO, or for service accounts, the following password complexity rules are enforced systematically:
* Minimum length of 14 characters.
* Must contain at least one uppercase letter, one lowercase letter, one number, and one special character.
* Passwords expire and must be rotated every 90 days.
* Password reuse for the last 5 passwords is automatically blocked.

## 3. Endpoint Management
All company-issued workstations (laptops and desktops) are managed via Mobile Device Management (MDM) solutions (Jamf for macOS, Microsoft Intune for Windows). 
* Full disk encryption (FileVault or BitLocker) is enforced on all endpoints.
* USB mass storage devices are disabled via policy.