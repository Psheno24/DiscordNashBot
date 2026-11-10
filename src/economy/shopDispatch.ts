/**
 * Единая точка входа в мутации магазина для Discord и Telegram.
 * UI-слой (кнопки / callback) только вызывает эти функции и рисует следующий экран.
 */
export {
  attachVehiclePlateToCar,
  changeVehiclePlateDigits,
  changeVehiclePlateDigitsForCar,
  changeVehiclePlateLetters,
  changeVehiclePlateLettersForCar,
  changeVehiclePlateRegion,
  changeVehiclePlateRegionForCar,
  detachVehiclePlateFromCar,
  purchaseApartment,
  purchaseApartmentFull,
  purchaseApartmentTrade,
  purchaseCar,
  purchaseCarFull,
  purchaseCarTrade,
  purchasePhone,
  purchasePhoneFull,
  purchasePhoneTrade,
  registerVehiclePlate,
  registerVehiclePlateForCar,
  sellForeignApartment,
  sellOwnedApartment,
  sellOwnedCar,
  sellOwnedPhone,
  sellSovietApartment,
  syncVehiclePlatePrestige,
} from "./economyShopActions.js";
