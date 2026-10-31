// FEAT-89/FEAT-90: setup-wizard contracts shared by api/ and web/. Import only from shared/.

/** Body of GET /api/user/onboarding: what the wizard needs when it opens. */
export interface OnboardingState {
  /** FEAT-90: "Later" was chosen during the current sign-in. */
  postponed: boolean;
  /** FEAT-89: the instance has cellars and none was created by this member. */
  joining: boolean;
  /** FEAT-90 (#685): the first cellar this member created, the wizard's default when it resumes. */
  wizardCellar: { id: string; name: string } | null;
  /** FEAT-89: what a joining member finds — every cellar, and the bottles and the cigars in stock, counted apart (#471). */
  cellarCount: number;
  bottleCount: number;
  cigarCount: number;
}
