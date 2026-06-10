# SIG-EPE Frontend deployment notes

The frontend production deployment runs on Vercel. Production is available at `https://sig-epe.vercel.app/login` and should deploy from the GitHub `develop` branch through the Vercel project connected to `SIG-EPE/sig-epe_frontend`.

The backend remains on Azure. Keep backend deployment, storage, and infrastructure changes in the backend repository; this frontend repository should not deploy an Azure Static Web App.

## Vercel configuration

Configure these values in the Vercel project environment settings; do not commit real secret values:

Required environment variables:

- `NEXT_PUBLIC_API_URL` — production backend URL, for example the HTTPS URL of the Azure backend app.
- `JWT_ACCESS_SECRET` — same JWT access secret used by the backend so Next.js middleware can verify auth cookies.

Recommended environment variables:

- `NEXT_PUBLIC_ONBOARDING_RECOMMENDED_EMAIL_DOMAINS` — comma-separated corporate domains shown as a non-blocking recommendation during onboarding/profile updates. Use `ensenaperu.org` unless the organization changes domains.
- `NEXT_PUBLIC_ONBOARDING_ALLOWED_EMAIL_DOMAINS` — legacy fallback name for older deployments only; prefer the recommended-domain variable for new configuration.

## GitHub Actions

GitHub Actions are kept for continuous integration only:

- `.github/workflows/ci.yml` runs type-check, unit tests, and build on `develop` pushes and pull requests.

Deployment is intentionally handled by Vercel, so the former Azure Static Web App deployment workflow has been removed. The repository should no longer require these frontend-only Azure Static Web Apps settings:

- `AZURE_STATIC_WEB_APPS_API_TOKEN`
- `AZURE_STATIC_WEB_APPS_DEPLOY_ENABLED`

## Notes

- Vercel environment variables are applied at build/runtime according to Vercel's environment scope. Rebuild after changing `NEXT_PUBLIC_*` values because they are embedded in the client bundle.
- Keep `JWT_ACCESS_SECRET` synchronized with the Azure backend value without exposing it in logs, docs, or commits.
