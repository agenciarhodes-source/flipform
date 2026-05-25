# Install and validation

This project uses npm as the package manager.

Required commands:

```bash
npm config set registry https://registry.npmjs.org/
npm ci
npm run prisma:generate
npm run prisma:validate
npm run typecheck
npm run build
npm run smoke:test
```

If npm ci or npm install fails with HTTP 403, the problem is registry/auth/network access, not Prisma or Next.js.

Check:

```bash
npm config get registry
npm ping --registry=https://registry.npmjs.org/
npm whoami || true
npm config list
```

Do not commit npm tokens or secrets.

Do not use private registries unless the project actually depends on private packages.
