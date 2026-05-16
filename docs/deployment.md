# SIG-EPE Frontend deployment notes

The frontend is prepared for the existing Azure Static Web App `webapsigepe` and deploys from the `develop` branch when explicitly enabled.

## GitHub configuration

Required repository secrets:

- `AZURE_STATIC_WEB_APPS_API_TOKEN` — deployment token from the existing Azure Static Web App `webapsigepe`.
- `SWA_JWT_ACCESS_SECRET` — same JWT access secret used by the backend so Next.js middleware can verify auth cookies.

Required or recommended repository variables:

- `AZURE_STATIC_WEB_APPS_DEPLOY_ENABLED` — set to `true` only when deploys from `develop` should run.
- `NEXT_PUBLIC_API_URL` — production backend URL, for example the HTTPS URL of `sigepe-web`.
- `NEXT_PUBLIC_ONBOARDING_ALLOWED_EMAIL_DOMAINS` — comma-separated allowed onboarding email domains, if onboarding restrictions are enabled.

## Azure Static Web App settings

Set runtime/build settings in Azure as needed; do not commit secret values.

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_ONBOARDING_ALLOWED_EMAIL_DOMAINS`
- `JWT_ACCESS_SECRET`

## Notes

- The workflow intentionally references GitHub secrets and variables only; no credentials or local `.env` values are committed.
- Enable the deploy job only after confirming the Azure Static Web App deployment token and production backend URL.
