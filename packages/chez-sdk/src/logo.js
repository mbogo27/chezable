// The Chezable logo, inlined. Paths come from brand/logo-paths.json (traced from the supplied PNG by
// scripts/logo.mjs): the figure mark, then the "chez" and "able" wordmark halves.
import { mark, markViewBox, chez, able, viewBox } from '../../../brand/logo-paths.json';

export const logoMarkSvg = `<svg viewBox="${markViewBox}" aria-hidden="true" style="width:24px;height:24px"><path fill="currentColor" fill-rule="evenodd" d="${mark}"/></svg>`;
/** The full lockup (mark + wordmark), as used in the shared header. */
export const logoSvg = `<svg viewBox="${viewBox}" aria-hidden="true" class="logo-svg"><path class="logo-mark" fill-rule="evenodd" d="${mark}"/><path class="logo-chez" fill-rule="evenodd" d="${chez}"/><path class="logo-able" fill-rule="evenodd" d="${able}"/></svg>`;
