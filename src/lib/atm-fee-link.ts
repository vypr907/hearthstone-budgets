/**
 * ADR-110: shared by `useLinkTransferFee` (data-hooks.ts) and
 * `findUnlinkedAtmFeeCandidates` (atm-fee-repair.ts) so the hook that
 * performs the link and the screen that suggests it never disagree about
 * what counts as "close enough" in date.
 */
export const ATM_FEE_LINK_MAX_DATE_DIFF_DAYS = 2;
