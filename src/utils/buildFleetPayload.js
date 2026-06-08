// Splits a FleetsView form object into the two DB payloads it maps to.
// fleetData → fleets table
// profileData → fleet_profiles table
export function buildFleetPayload(form) {
  const fleetData = {
    name:         form.name,
    mc_number:    form.mcNumber,
    dot_number:   form.dotNumber,
    phone_number: form.phoneNumber,
    email:        form.email,
    home_address: form.homeAddress,
    home_lat:     form.homeLat,
    home_lng:     form.homeLng,
  };

  const profileData = {
    trailer_type:              form.trailerType || null,
    equipment_variation:       form.equipmentVariation || null,
    // Optional transport modes the fleet handles (item 007); null when none selected.
    modes:                     Array.isArray(form.modes) && form.modes.length ? form.modes : null,
    revenue_split_carrier:     Number(form.revenueSplitCarrier) || 20,
    // #122: split is strictly complementary — store the derived customer % too, else it
    // falls to the DB DEFAULT 20 (wrong) since v2 never wrote it. Mirrors v1 FleetSetup.
    revenue_split_customer:    100 - (Number(form.revenueSplitCarrier) || 20),
    mileage_rate:              Number(form.mileageRate) || null,
    stop_rate:                 Number(form.stopRate) || null,
    fuel_peg:                  Number(form.fuelPeg) || null,
    fuel_mpg:                  form.fuelMpg !== '' && form.fuelMpg != null ? Number(form.fuelMpg) : null,
    doe_padd_region:           form.doePaddRegion,
    doe_padd_rate:             Number(form.doePaddRate) || null,
    other_charge_1_name:        form.otherCharge1Name,
    other_charge_1_description: form.otherCharge1Description,
    other_charge_1_amount:      Number(form.otherCharge1Amount) || null,
    other_charge_2_name:        form.otherCharge2Name,
    other_charge_2_description: form.otherCharge2Description,
    other_charge_2_amount:      Number(form.otherCharge2Amount) || null,
  };

  return { fleetData, profileData };
}
