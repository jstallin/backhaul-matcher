import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Backhaul data will be fetched at runtime
let backhaulLoadsData = null;

const loadBackhaulData = async () => {
  if (backhaulLoadsData) return backhaulLoadsData;

  try {
    // Fetch from the deployed app's public data
    const response = await fetch('https://backhaul-matcher.vercel.app/backhaul_loads_data.json');
    if (response.ok) {
      backhaulLoadsData = await response.json();
      return backhaulLoadsData;
    }
  } catch (e) {
    console.error('Failed to fetch backhaul data:', e.message);
  }

  return [];
};

// Initialize Supabase client for server-side
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

// ============================================
// MATCHING ALGORITHM (adapted from routeHomeMatching.js)
// ============================================

const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 3959; // Radius of Earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const isAlongRoute = (pickupLat, pickupLng, datumLat, datumLng, homeLat, homeLng, corridorWidthMiles = 100) => {
  const directDistance = calculateDistance(datumLat, datumLng, homeLat, homeLng);
  const datumToPickup = calculateDistance(datumLat, datumLng, pickupLat, pickupLng);
  const pickupToHome = calculateDistance(pickupLat, pickupLng, homeLat, homeLng);
  const totalDistance = datumToPickup + pickupToHome;
  const deviation = totalDistance - directDistance;
  return deviation <= corridorWidthMiles;
};

const findRouteHomeBackhauls = (datumPoint, fleetHome, fleetProfile, backhaulLoads, homeRadiusMiles = 50, corridorWidthMiles = 100) => {
  const opportunities = [];
  const directReturnMiles = calculateDistance(datumPoint.lat, datumPoint.lng, fleetHome.lat, fleetHome.lng);
  const availableLoads = backhaulLoads.filter(load => load.status === 'available');

  availableLoads.forEach(load => {
    if (load.equipment_type !== fleetProfile.trailerType) return;
    if (load.trailer_length > fleetProfile.trailerLength) return;
    if (load.weight_lbs > fleetProfile.weightLimit) return;

    const isPickupAlongRoute = isAlongRoute(
      load.pickup_lat, load.pickup_lng,
      datumPoint.lat, datumPoint.lng,
      fleetHome.lat, fleetHome.lng,
      corridorWidthMiles
    );
    if (!isPickupAlongRoute) return;

    const deliveryToHome = calculateDistance(load.delivery_lat, load.delivery_lng, fleetHome.lat, fleetHome.lng);
    if (deliveryToHome > homeRadiusMiles) return;

    const datumToPickup = calculateDistance(datumPoint.lat, datumPoint.lng, load.pickup_lat, load.pickup_lng);
    const pickupToDelivery = load.distance_miles;
    const totalMilesWithBackhaul = datumToPickup + pickupToDelivery + deliveryToHome;
    const totalRevenue = load.total_revenue;
    const revenuePerMile = totalRevenue / totalMilesWithBackhaul;
    const efficiencyScore = revenuePerMile * (directReturnMiles / totalMilesWithBackhaul) * 100;

    opportunities.push({
      ...load,
      totalRevenue,
      revenuePerMile,
      efficiency_score: efficiencyScore,
      origin: { city: load.pickup_city, state: load.pickup_state },
      destination: { city: load.delivery_city, state: load.delivery_state }
    });
  });

  opportunities.sort((a, b) => b.efficiency_score - a.efficiency_score);
  return opportunities;
};

// ============================================
// GEOCODING (simplified server-side version)
// ============================================

const NC_CITIES = {
  'davidson': { lat: 35.4993, lng: -80.8487 },
  'charlotte': { lat: 35.2271, lng: -80.8431 },
  'raleigh': { lat: 35.7796, lng: -78.6382 },
  'alachua': { lat: 29.7377, lng: -82.4248 },
  'gainesville': { lat: 29.6516, lng: -82.3248 },
  'jacksonville': { lat: 30.3322, lng: -81.6557 },
  'tampa': { lat: 27.9506, lng: -82.4572 },
  'orlando': { lat: 28.5383, lng: -81.3792 },
  'lakeland': { lat: 28.0395, lng: -81.9498 },
};

const geocodeDatumPoint = async (datumPoint) => {
  // Try Mapbox first
  const mapboxToken = process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN;

  if (mapboxToken && mapboxToken !== 'your_mapbox_public_token') {
    try {
      const encoded = encodeURIComponent(datumPoint.trim());
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${mapboxToken}&country=US&limit=1`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        return { lat, lng };
      }
    } catch (error) {
      console.error('Mapbox geocoding error:', error.message);
    }
  }

  // Fallback to local lookup
  const cleaned = datumPoint.toLowerCase().trim();
  for (const [key, value] of Object.entries(NC_CITIES)) {
    if (cleaned.includes(key)) {
      return value;
    }
  }

  return null;
};

// ============================================
// NOTIFICATION LOGIC
// ============================================

const detectMaterialChange = (lastMatchId, lastMatchRevenue, newTopMatch) => {
  if (!newTopMatch) return null;

  // First time - no previous match to compare
  if (!lastMatchId) return null;

  // Check if top match changed
  if (lastMatchId !== newTopMatch.load_id) {
    return { type: 'new_top', newMatch: newTopMatch };
  }

  // Check if price changed significantly (>= $10)
  if (lastMatchRevenue) {
    const priceDiff = newTopMatch.totalRevenue - lastMatchRevenue;
    if (Math.abs(priceDiff) >= 10) {
      return {
        type: priceDiff > 0 ? 'price_increase' : 'price_decrease',
        newMatch: newTopMatch,
        priceDiff
      };
    }
  }

  return null;
};

// Convert phone number to email-to-SMS gateway address
const convertPhoneToEmailGateway = (phone, carrier = 'verizon') => {
  if (!phone) return null;

  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');

  const gateways = {
    'verizon': 'vtext.com',
    'att': 'txt.att.net',
    'tmobile': 'tmomail.net',
    'sprint': 'messaging.sprintpcs.com',
    'boost': 'sms.myboostmobile.com',
    'cricket': 'sms.cricketwireless.net',
    'uscellular': 'email.uscc.net'
  };

  if (gateways[carrier]) {
    return `${digits}@${gateways[carrier]}`;
  }

  return null;
};

const buildNotificationMessage = (requestName, _fleetName, changeType, newTopMatch, priceDiff) => {
  const route = `${newTopMatch.origin.city}, ${newTopMatch.origin.state} → ${newTopMatch.destination.city}, ${newTopMatch.destination.state}`;
  const revenue = newTopMatch.totalRevenue;

  let subject, text;

  switch (changeType) {
    case 'new_top':
      subject = `🎯 New Top Backhaul for ${requestName}`;
      text = `New top backhaul opportunity for "${requestName}"!\n\nRoute: ${route}\nRevenue: $${revenue.toFixed(2)}\n\nLog in to Haul Monitor to view details.`;
      break;
    case 'price_increase':
      subject = `📈 Price Increase for ${requestName}`;
      text = `Top backhaul price increased by $${Math.abs(priceDiff).toFixed(2)} for "${requestName}".\n\nRoute: ${route}\nNew Revenue: $${revenue.toFixed(2)}\n\nLog in to Haul Monitor to view details.`;
      break;
    case 'price_decrease':
      subject = `📉 Price Change for ${requestName}`;
      text = `Top backhaul price decreased by $${Math.abs(priceDiff).toFixed(2)} for "${requestName}".\n\nRoute: ${route}\nNew Revenue: $${revenue.toFixed(2)}`;
      break;
    default:
      subject = `Backhaul Update for ${requestName}`;
      text = `There's an update for your backhaul request "${requestName}". Log in to Haul Monitor to view details.`;
  }

  return { subject, text };
};

const sendNotification = async (method, email, phone, subject, text) => {
  const results = { email: null, sms: null };

  // Debug logging
  console.log('📧 sendNotification called:', {
    method,
    email: email || '(not set)',
    phone: phone || '(not set)',
    subject,
    hasResendKey: !!process.env.RESEND_API_KEY,
    hasTwilioConfig: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER)
  });

  // Send email
  if ((method === 'email' || method === 'both') && email) {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        console.log(`📤 Attempting to send email to ${email}...`);
        const { data, error } = await resend.emails.send({
          from: 'Haul Monitor <notifications@haulmonitor.com>',
          to: [email],
          subject,
          text
        });
        if (error) {
          results.email = { success: false, error: error.message };
          console.error(`❌ Email failed:`, error);
        } else {
          results.email = { success: true, id: data?.id };
          console.log(`✅ Email sent to ${email}, id: ${data?.id}`);
        }
      } catch (error) {
        results.email = { success: false, error: error.message };
        console.error(`❌ Email exception: ${error.message}`);
      }
    } else {
      console.log('⚠️ Skipping email - RESEND_API_KEY not configured');
      results.email = { success: false, error: 'RESEND_API_KEY not configured' };
    }
  } else {
    console.log(`⚠️ Skipping email - method=${method}, email=${email || 'not set'}`);
  }

  // Send SMS via email-to-SMS gateway
  if ((method === 'text' || method === 'both') && phone) {
    const resendKey = process.env.RESEND_API_KEY;
    const carrier = process.env.SMS_CARRIER || 'verizon';

    // Convert phone to email gateway address
    const smsEmail = convertPhoneToEmailGateway(phone, carrier);

    if (smsEmail && resendKey) {
      try {
        console.log(`📤 Attempting to send SMS via email gateway to ${smsEmail}...`);
        const resend = new Resend(resendKey);
        const { data, error } = await resend.emails.send({
          from: 'Haul Monitor <notifications@haulmonitor.com>',
          to: [smsEmail],
          subject: 'Haul Monitor Alert',
          text: text.substring(0, 160) // SMS-friendly length
        });
        if (error) {
          results.sms = { success: false, error: error.message, gateway: smsEmail };
          console.error(`❌ SMS via email gateway failed:`, error);
        } else {
          results.sms = { success: true, id: data?.id, gateway: smsEmail };
          console.log(`✅ SMS sent via email gateway to ${smsEmail}, id: ${data?.id}`);
        }
      } catch (error) {
        results.sms = { success: false, error: error.message, gateway: smsEmail };
        console.error(`❌ SMS via email gateway exception: ${error.message}`);
      }
    } else if (!smsEmail) {
      console.log(`⚠️ Skipping SMS - could not determine gateway for carrier: ${carrier}`);
      results.sms = { success: false, error: `Unknown carrier: ${carrier}` };
    } else {
      console.log('⚠️ Skipping SMS - RESEND_API_KEY not configured');
      results.sms = { success: false, error: 'RESEND_API_KEY not configured' };
    }
  } else {
    console.log(`⚠️ Skipping SMS - method=${method}, phone=${phone || 'not set'}`);
  }

  console.log('📧 sendNotification results:', results);
  return results;
};

// ============================================
// MAIN CRON HANDLER
// ============================================

export default async function handler(req, res) {
  // Verify cron secret
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('🔄 Server-side backhaul refresh starting...');
  const startTime = Date.now();

  try {
    // Load backhaul data at runtime
    const loadsData = await loadBackhaulData();
    console.log(`📦 Loaded ${loadsData.length} backhaul loads`);

    // 1. Get all active requests that are due for refresh
    const now = new Date().toISOString();
    const { data: requests, error: fetchError } = await supabase
      .from('backhaul_requests')
      .select('*, fleets(*, fleet_profiles(*))')
      .eq('status', 'active')
      .eq('auto_refresh', true)
      .lte('next_refresh_at', now);

    if (fetchError) {
      throw new Error(`Failed to fetch requests: ${fetchError.message}`);
    }

    console.log(`📋 Found ${requests?.length || 0} requests due for refresh`);

    if (!requests || requests.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No requests due for refresh',
        processed: 0
      });
    }

    const results = [];

    // 2. Process each request
    for (const request of requests) {
      console.log(`\n🔍 Processing request: ${request.request_name}`);

      try {
        const fleet = request.fleets;
        if (!fleet) {
          console.log('  ⚠️ No fleet found, skipping');
          continue;
        }

        // Get fleet profile
        const fleetProfile = fleet.fleet_profiles?.[0] || {
          trailerType: 'Dry Van',
          trailerLength: 53,
          weightLimit: 45000
        };

        // Geocode datum point
        const datumCoords = await geocodeDatumPoint(request.datum_point);
        if (!datumCoords) {
          console.log(`  ⚠️ Could not geocode datum point: ${request.datum_point}`);
          continue;
        }

        // Check fleet has coordinates
        if (!fleet.home_lat || !fleet.home_lng) {
          console.log('  ⚠️ Fleet missing home coordinates, skipping');
          continue;
        }

        // Run matching algorithm
        const matches = findRouteHomeBackhauls(
          { lat: datumCoords.lat, lng: datumCoords.lng },
          { lat: fleet.home_lat, lng: fleet.home_lng },
          fleetProfile,
          loadsData,
          50,  // homeRadiusMiles
          100  // corridorWidthMiles
        );

        console.log(`  📦 Found ${matches.length} matches`);

        const topMatch = matches[0] || null;
        let notificationSent = false;

        // Check for material change
        if (topMatch && request.notification_enabled) {
          const change = detectMaterialChange(
            request.last_top_match_id,
            request.last_top_match_revenue,
            topMatch
          );

          if (change) {
            console.log(`  📬 Material change detected: ${change.type}`);

            const { subject, text } = buildNotificationMessage(
              request.request_name,
              fleet.name,
              change.type,
              change.newMatch,
              change.priceDiff
            );

            const notifResult = await sendNotification(
              request.notification_method || 'both',
              fleet.email,
              fleet.phone_number,
              subject,
              text
            );

            notificationSent = notifResult.email?.success || notifResult.sms?.success;
          } else {
            console.log('  ℹ️ No material change detected');
          }
        }

        // Calculate next refresh time
        const intervalMinutes = request.auto_refresh_interval || 240;
        const nextRefreshAt = new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString();

        // Update request with new match info and next refresh time
        const { error: updateError } = await supabase
          .from('backhaul_requests')
          .update({
            last_top_match_id: topMatch?.load_id || null,
            last_top_match_revenue: topMatch?.totalRevenue || null,
            last_server_refresh_at: now,
            next_refresh_at: nextRefreshAt
          })
          .eq('id', request.id);

        if (updateError) {
          console.error(`  ❌ Failed to update request: ${updateError.message}`);
        }

        results.push({
          requestId: request.id,
          requestName: request.request_name,
          matchesFound: matches.length,
          topMatchId: topMatch?.load_id,
          notificationSent,
          nextRefreshAt
        });

      } catch (requestError) {
        console.error(`  ❌ Error processing request ${request.id}:`, requestError.message);
        results.push({
          requestId: request.id,
          requestName: request.request_name,
          error: requestError.message
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`\n✅ Cron job completed in ${duration}ms`);

    return res.status(200).json({
      success: true,
      processed: results.length,
      duration: `${duration}ms`,
      results
    });

  } catch (error) {
    console.error('❌ Cron job failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
