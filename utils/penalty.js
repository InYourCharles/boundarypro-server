// BR4: the no-show penalty is the larger of 50 pesos or 20% of the boundary rate, rounded to the
// nearest peso. Keeping the formula in one place means the seed script and the status endpoint
// can never disagree about what a no-show costs.
export default function penaltyFor(boundaryRate) {
  return Math.max(50, Math.round(0.2 * boundaryRate));
}
