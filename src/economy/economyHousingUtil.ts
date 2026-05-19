import type { EconomyUser } from "./userStore.js";

/** Сброс полей аренды (советское жильё). */
export function clearSovietHousingRentPatch(): Partial<EconomyUser> {
  return {
    housingKind: "none",
    housingRentNextDueMs: undefined,
    housingRentPlan: undefined,
    housingRentRenewalPlan: undefined,
    housingRentLastPaidRub: undefined,
    housingRentLastPeriodMs: undefined,
    housingRentChainStartedAtMs: undefined,
    housingRentTotalPaidRub: undefined,
  };
}

/** При покупке авто или своего жилья — снять аренду вела и аренду комнаты. */
export function cancelRentAndBikeOnAssetPurchase(u: EconomyUser): Partial<EconomyUser> {
  const patch: Partial<EconomyUser> = {
    courierBikeUntilMs: undefined,
  };
  if (u.housingKind === "rent") {
    Object.assign(patch, clearSovietHousingRentPatch());
  }
  return patch;
}
