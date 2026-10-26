# Andre Erving management portal — staging
This repository is exclusively for staff CMS, customer/course management, document administration, and blog publishing. Final hostname: manage.andreerving.com. Do not configure production DNS yet.
## Acceptance tests
- Staff sign-in and authorization through Supabase admin_profiles; non-staff denied.
- Blog draft creation/edit/publish; no empty migrated article published.
- Course, module and lesson create/edit workflow with valid foreign keys.
- Read-only order and customer views show only authorized staff records.
- Staff uploads private files to the correct customer folder; customer can download.
- Audit RLS, storage policies, HTML content safety, role permissions, and mobile layout.
- Import full legacy articles and images, keep original /post/ slugs before retirement of old site.
## Deployment
Configure GitHub Pages from main as temporary staging, add approved redirect URL to Supabase Auth, and verify HTTPS. Defer CNAME and Cloudflare DNS until production cutover.
