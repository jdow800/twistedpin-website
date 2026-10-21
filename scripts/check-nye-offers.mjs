/** Production Brand offer/consent regression, using real React and a synthetic
 * local API. Shares the full-flow harness so accepted-review evidence is tested
 * through PaymentStep instead of a props-only payment stub.
 * No backend, Stripe provider, email or credentials are used.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result=spawnSync(process.execPath,[
  fileURLToPath(new URL('./check-nye-brand-flow.mjs',import.meta.url)),
  '--only=Production SMS consent',
],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
