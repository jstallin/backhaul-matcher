/**
 * HOS (Hours of Service) Calculator
 *
 * Models the simplified HOS rules used for Work Week Planning:
 *   - Driver can drive up to dailyDriveMiles before mandatory rest
 *   - After dailyDriveMiles, driver must rest restHours before continuing
 *   - Average speed is driveMph for all legs
 *
 * This is a v1 simplification of federal HOS rules (70-hour/8-day limit,
 * 14-hour on-duty window, 30-min break after 8 hrs) — sufficient for
 * weekly planning estimates and matches the spec's intent.
 */

const DEFAULT_HOS = {
  dailyDriveMiles: 500,  // miles before mandatory rest
  driveMph: 50,          // average truck speed
  restHours: 10,         // mandatory rest duration after daily limit
};

// Total trip duration in milliseconds, accounting for rest stops.
// Internal — shared by calculateArrival, calculateLatestDeparture, calculateElapsedHours.
const tripDurationMs = (distanceMiles, hos) => {
  let remaining = Math.max(0, distanceMiles);
  let elapsedMs = 0;

  while (remaining > 0) {
    const legMiles = Math.min(remaining, hos.dailyDriveMiles);
    elapsedMs += (legMiles / hos.driveMph) * 3_600_000;
    remaining -= legMiles;
    if (remaining > 0) elapsedMs += hos.restHours * 3_600_000;
  }

  return elapsedMs;
};

/**
 * Calculate when a driver arrives given a departure time and distance.
 * Inserts mandatory rest stops every dailyDriveMiles.
 *
 * @param {Date|string|number} startTime - Departure time
 * @param {number} distanceMiles - Total trip distance
 * @param {object} hosConfig - Optional overrides for HOS parameters
 * @returns {Date} Arrival time
 */
export const calculateArrival = (startTime, distanceMiles, hosConfig = {}) => {
  const hos = { ...DEFAULT_HOS, ...hosConfig };
  const durationMs = tripDurationMs(distanceMiles, hos);
  return new Date(new Date(startTime).getTime() + durationMs);
};

/**
 * Calculate the latest a driver can depart to arrive by a deadline.
 * Inverse of calculateArrival.
 *
 * @param {Date|string|number} deadline - Must arrive by this time
 * @param {number} distanceMiles - Total trip distance
 * @param {object} hosConfig - Optional overrides for HOS parameters
 * @returns {Date} Latest departure time
 */
export const calculateLatestDeparture = (deadline, distanceMiles, hosConfig = {}) => {
  const hos = { ...DEFAULT_HOS, ...hosConfig };
  const durationMs = tripDurationMs(distanceMiles, hos);
  return new Date(new Date(deadline).getTime() - durationMs);
};

/**
 * Total elapsed time for a trip in hours, including rest stops.
 *
 * @param {number} distanceMiles
 * @param {object} hosConfig - Optional overrides
 * @returns {number} Hours (decimal)
 */
export const calculateElapsedHours = (distanceMiles, hosConfig = {}) => {
  const hos = { ...DEFAULT_HOS, ...hosConfig };
  return tripDurationMs(distanceMiles, hos) / 3_600_000;
};

/**
 * Break a trip into drive segments with rest windows between them.
 * Useful for itinerary display and timeline visualization.
 *
 * @param {Date|string|number} startTime - Departure time
 * @param {number} distanceMiles - Total trip distance
 * @param {object} hosConfig - Optional overrides
 * @returns {Array<{departureTime, arrivalTime, driveMiles, cumulativeMiles, restAfterHours}>}
 */
export const getSegments = (startTime, distanceMiles, hosConfig = {}) => {
  const hos = { ...DEFAULT_HOS, ...hosConfig };
  const segments = [];
  let currentMs = new Date(startTime).getTime();
  let remaining = Math.max(0, distanceMiles);
  let cumulative = 0;

  while (remaining > 0) {
    const legMiles = Math.min(remaining, hos.dailyDriveMiles);
    const departure = new Date(currentMs);
    currentMs += (legMiles / hos.driveMph) * 3_600_000;
    remaining -= legMiles;
    cumulative += legMiles;

    const restAfterHours = remaining > 0 ? hos.restHours : 0;
    segments.push({
      departureTime: departure,
      arrivalTime: new Date(currentMs),
      driveMiles: legMiles,
      cumulativeMiles: cumulative,
      restAfterHours,
    });

    if (remaining > 0) currentMs += hos.restHours * 3_600_000;
  }

  return segments;
};
