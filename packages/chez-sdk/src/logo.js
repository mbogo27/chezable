// The figure mark, inlined in the shell bar. Paths come from brand/logo-paths.json
// (traced from the supplied PNG by scripts/logo.mjs). The full lockup lives in the web app bundle.
// Named imports let esbuild drop the wordmark paths from this bundle.
import { mark, markViewBox } from '../../../brand/logo-paths.json';

export const logoMarkSvg = `<svg viewBox="${markViewBox}" aria-hidden="true" style="width:24px;height:24px"><path fill="currentColor" fill-rule="evenodd" d="${mark}"/></svg>`;
