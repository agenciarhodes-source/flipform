/* eslint-disable no-console */
import { validateEnvironment } from '@/lib/config/validate-env';

const result = validateEnvironment(process.env);

console.log('FlipForm environment validation\n');
console.log('Environment:');
console.log(`- NODE_ENV=${result.environment.nodeEnv}`);
console.log(`- VERCEL_ENV=${result.environment.vercelEnv || '(unset)'}`);
console.log('\nChecks:');
for (const c of result.checks) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.message}`);
}

if (result.ok) {
  console.log('\nResult: OK');
  process.exit(0);
}

console.log('\nResult: FAILED\n');
console.log('Errors:');
for (const e of result.errors) console.log(`- ${e}`);
process.exit(1);
