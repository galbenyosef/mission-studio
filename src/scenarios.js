// ============================================================================
// scenarios.js — real-mission presets (sources: NASA mission reports, Wikipedia
// mission pages, CNSA releases). Times UTC.  MET = hours after liftoff.
// ============================================================================
const SCENARIOS = [
  {
    id: 'apollo8', title: 'Apollo 8', year: 1968, agency: 'NASA', status: 'Flown', crewed: true, dest: 'moon', tag: 'Lunar orbit & return',
    blurb: 'First humans to leave Earth orbit. Ten orbits of the Moon on Christmas Eve 1968 — the “Earthrise” photograph — then home. No lander.',
    crewNames: 'Frank Borman, Jim Lovell, Bill Anders',
    real: { 'Launch': '1968-12-21 12:51 UTC', 'TLI': 'GET 2:50:37, 5 m 18 s burn', 'Lunar orbit': '10 revs, 111 × 112 km', 'TEI': 'GET 89:19:16', 'Splashdown': '1968-12-27 15:51 UTC, 8.1°N 165.0°W', 'Duration': '6 d 3 h 0 m' },
    cfg: {
      name: 'Apollo 8', profile: 'lunar-orbit', launcher: 'saturnV', spacecraft: 'apolloCSMLTA', crew: 3, shipName: 'Apollo 8 (CSM-103)',
      site: 'KSC39A', launch: '1968-12-21T12:51:00Z', launchAz: 72.124, parking: { hp: 185, ha: 190 },
      tliMET: 2.843, tof: 66.2, sepAfterTLI: 0.55, mccMET: 10.99, perilune: 112, loi: { apo: 312, circ: 112, circAfter: 4.45 },
      teiMET: 89.32, returnTof: 57.5, returnMccAfter: 14.7,
      splash: { lat: 8.133, lon: -165.017, name: 'Pacific, USS Yorktown' }, entry: { fpa: -6.5 },
      sepName: 'CSM separation from S-IVB', sepDesc: 'The CSM separates from the S-IVB, which carries the LM test article (LTA-B) into solar orbit after a lunar slingshot.',
      scripted: [
        { when: 'lunarOrbit', met: 75.80, name: 'Earthrise', desc: 'Bill Anders photographs the Earth rising over the lunar horizon (AS08-14-2383) — one of the most influential photographs ever taken.', kind: 'photo' },
        { when: 'lunarOrbit', met: 85.73, name: 'Christmas Eve broadcast', desc: 'The crew reads from the Book of Genesis during a live TV broadcast from lunar orbit, watched by an estimated billion people.', kind: 'info' },
      ],
    },
  },
  {
    id: 'apollo11', title: 'Apollo 11', year: 1969, agency: 'NASA', status: 'Flown', crewed: true, dest: 'moon', tag: 'Landing & return',
    blurb: 'First crewed lunar landing. Eagle lands in the Sea of Tranquility while Columbia waits in lunar orbit; lunar-orbit rendezvous, then return to the Pacific.',
    crewNames: 'Neil Armstrong, Buzz Aldrin, Michael Collins',
    real: { 'Launch': '1969-07-16 13:32 UTC', 'TLI': 'GET 2:44:16, Δv ≈ 3,182 m/s', 'LOI-1': 'GET 75:49:50, Δv ≈ 889 m/s', 'Landing': '1969-07-20 20:17:40 UTC, 0.674°N 23.473°E', 'Lunar liftoff': 'GET 124:22', 'Splashdown': '1969-07-24 16:50 UTC, 13.3°N 169.2°W', 'Entry speed': '11.03 km/s' },
    cfg: {
      name: 'Apollo 11', profile: 'lunar-landing', launcher: 'saturnV', spacecraft: 'apolloCSMLM', crew: 3, landerCrew: 2, shipName: 'Columbia (CSM-107)', landerName: 'Eagle (LM-5)',
      site: 'KSC39A', launch: '1969-07-16T13:32:00Z', launchAz: 72.058, parking: { hp: 185, ha: 190 },
      tliMET: 2.738, tof: 73.0, sepAfterTLI: 1.3, mccMET: 26.75, perilune: 111, loi: { apo: 314, circ: 120, circAfter: 4.36 },
      landing: { lat: 0.67408, lon: 23.47297, name: 'Tranquility Base' }, undockMET: 100.2, pdiMET: 102.55, landMET: 102.76, ascentMET: 124.367, ascentOrbit: { hp: 17, ha: 87 }, samples: 21.5,
      rendezvousMinDelay: 0.9, ascJettisonAfter: 2.1, teiMET: 135.395, returnTof: 59.6, returnMccAfter: 15.1,
      splash: { lat: 13.317, lon: -169.15, name: 'Pacific, USS Hornet' }, entry: { fpa: -6.48 },
      sepName: 'Transposition, docking & extraction', sepDesc: 'Columbia separates, turns around, docks with Eagle and pulls it free of the S-IVB, which is then sent past the Moon into solar orbit.',
      undockName: 'Eagle undocks', undockDesc: '“The Eagle has wings.” Collins stays aboard Columbia in lunar orbit.', liftoffName: 'Eagle liftoff', dockName: 'Docking with Columbia', dsName: 'Eagle descent stage (Tranquility Base)', ascStageName: 'Eagle ascent stage',
      scripted: [
        { when: 'surface', afterLanding: 0.005, name: '“The Eagle has landed.”', desc: 'Armstrong: “Houston, Tranquility Base here. The Eagle has landed.” About 25 seconds of descent propellant remained.', kind: 'info' },
        { when: 'surface', afterLanding: 6.6, name: 'First step', desc: '“That’s one small step for [a] man, one giant leap for mankind.” — 1969-07-21 02:56 UTC.', kind: 'info' },
      ],
    },
  },
  {
    id: 'apollo13', title: 'Apollo 13', year: 1970, agency: 'NASA', status: 'Flown', crewed: true, dest: 'moon', tag: 'Free-return abort (flyby)',
    blurb: '“Houston, we’ve had a problem.” An oxygen tank explodes 56 hours out. The crew survives in the lunar module, swings around the Moon on a free-return trajectory and splashes down safely.',
    crewNames: 'Jim Lovell, Jack Swigert, Fred Haise',
    real: { 'Launch': '1970-04-11 19:13 UTC', 'Explosion': 'GET 55:54:53', 'DPS burn (free return)': 'GET 61:29:43', 'Closest approach': 'GET 77:02:39, 254 km above far side', 'Max distance': '400,171 km (record until Artemis II)', 'PC+2 burn': 'GET 79:27:39, ≈ 262 m/s', 'Splashdown': '1970-04-17 18:07 UTC, 21.6°S 165.4°W' },
    cfg: {
      name: 'Apollo 13', profile: 'lunar-flyby', launcher: 'saturnV', spacecraft: 'apolloCSMLM', crew: 3, shipName: 'Odyssey + Aquarius', landerName: 'Aquarius (LM-7)',
      site: 'KSC39A', launch: '1970-04-11T19:13:00Z', launchAz: 72.043, parking: { hp: 185, ha: 190 },
      tliMET: 2.596, tof: 74.4, sepAfterTLI: 0.5, mccMET: 30.68, perilune: 254,
      hybrid: { perilune: 111, lat: -3.65, lon: -17.47, landMET: 103.7 },
      lifeboat: 'LMDS', smSepBeforeEI: 282, lifeboatJettisonBeforeEI: 1.18, returnMccAfter: 25,
      splash: { lat: -21.633, lon: -165.367, name: 'South Pacific, USS Iwo Jima' }, entry: { fpa: -6.27 },
      sepName: 'Transposition, docking & extraction', smSepName: 'Service module jettison', smSepDesc: 'The crew sees the damage for the first time: an entire panel of the service module is blown away.', lifeboatName: 'Aquarius (lifeboat)', lifeboatJettisonName: 'Aquarius jettisoned', lifeboatJettisonDesc: '“Farewell, Aquarius, and we thank you.” The LM that kept the crew alive is released to burn up.',
      scripted: [
        { met: 55.915, name: 'Oxygen tank 2 explodes', desc: '“Houston, we’ve had a problem.” A damaged heater wire ignites insulation in oxygen tank 2. The service module loses oxygen, power and its main engine. The crew powers down Odyssey and moves into Aquarius.', kind: 'emergency' },
        { type: 'freeReturnBurn', met: 61.495, name: 'DPS burn — return to free return', desc: 'With the service module engine unusable, the lunar module descent engine puts the stack back on a free-return trajectory.', engine: 'LMDS' },
        { type: 'pc2', dt: 2.4, eiMET: 142.68, dvGuess: 260, name: 'PC+2 burn (descent engine)', desc: 'Two hours after pericynthion the LM descent engine burns to speed up the return and move splashdown to the Pacific recovery area.', engine: 'LMDS' },
      ],
    },
  },
  {
    id: 'artemis2', title: 'Artemis II', year: 2026, agency: 'NASA / CSA / ESA', status: 'Flown', crewed: true, dest: 'moon', tag: 'Crewed lunar flyby (free return)',
    blurb: 'First crewed flight of SLS and Orion (April 2026). A day in high Earth orbit for checkout, then a free-return loop 6,545 km beyond the lunar far side — a new human distance record.',
    crewNames: 'Reid Wiseman, Victor Glover, Christina Koch, Jeremy Hansen',
    real: { 'Launch': '2026-04-01 22:35:12 UTC, LC-39B', 'High Earth orbit': '192 × 70,174 km, 23.5 h', 'TLI': 'Flight day 2, OMS-E 5 m 49 s', 'Closest approach': '2026-04-06 23:00 UTC, 6,545 km above far side', 'Max distance': '406,771 km (record)', 'Splashdown': '2026-04-11 00:07 UTC, 32.3°N 117.8°W' },
    cfg: {
      name: 'Artemis II', profile: 'lunar-flyby', launcher: 'sls1', spacecraft: 'orion', crew: 4, shipName: 'Orion “Integrity”',
      site: 'KSC39B', launch: '2026-04-01T22:35:12Z', parking: { hp: 185, ha: 2300 },
      heo: { ha: 70174, name: 'Apogee raise burn (ICPS)', sepAfter: 1.35, sepName: 'Orion separates from ICPS', sepDesc: 'Orion separates from the Interim Cryogenic Propulsion Stage in high Earth orbit.', proxOps: true },
      tliBy: 'sc', tof: 95.6, mccAfterTLI: 22, perilune: 6545,
      returnMccAfter: 40, splash: { lat: 32.3, lon: -117.8, name: 'Pacific, SW of San Diego (USS John P. Murtha)' }, entry: { fpa: -5.9 },
      smSepBeforeEI: 20, smSepName: 'Crew module / ESM separation', smName: 'European Service Module',
      scripted: [
        { when: 'flyby', dt: -0.1, name: 'Solar eclipse from behind the Moon', desc: 'The crew watches the Sun disappear behind the Moon — a total solar eclipse seen from deep space.', kind: 'photo' },
      ],
    },
  },
  {
    id: 'change5', title: 'Chang’e 5', year: 2020, agency: 'CNSA', status: 'Flown', crewed: false, dest: 'moon', tag: 'Robotic landing & sample return',
    blurb: 'China’s first lunar sample return: 1,731 g of young basalt from Mons Rümker. Robotic landing, launch from the Moon, automated rendezvous in lunar orbit and a skip re-entry into Inner Mongolia.',
    real: { 'Launch': '2020-11-23 20:30 UTC, Long March 5', 'LOI': '2020-11-28 12:58 UTC', 'Landing': '2020-12-01 15:11 UTC, 43.06°N 51.92°W', 'Ascent': '2020-12-03 15:10 UTC', 'Docking': '2020-12-05 21:42 UTC', 'TEI': '2020-12-13 01:51 UTC', 'Landing on Earth': '2020-12-16 ≈18:00 UTC, Siziwang Banner' },
    cfg: {
      name: 'Chang’e 5', profile: 'lunar-landing', launcher: 'lm5', spacecraft: 'change5', crew: 0, shipName: 'Orbiter + returner', landerName: 'Lander + ascender',
      site: 'WENCHANG', launch: '2020-11-23T20:30:12Z', parking: { hp: 200, ha: 210 }, tof: 112, sepAfterTLI: 0.1, mccAfterTLI: 17,
      perilune: 200, loi: { apo: 5000, circ: 200, circAfter: 23.4 },
      landing: { lat: 43.0576, lon: -51.9161, name: 'Mons Rümker, Oceanus Procellarum' }, undockMET: 168.0, pdiMET: 186.6, landMET: 186.68, ascentMET: 234.67, ascentOrbit: { hp: 15, ha: 180 }, samples: 1.731,
      rendezvousMinDelay: 46, ascJettisonAfter: 6.9, teiMET: 461.35, returnTof: 88, returnMccAfter: 30,
      splash: { lat: 42.0, lon: 111.5, name: 'Siziwang Banner, Inner Mongolia' }, entry: { fpa: -5.5, skip: true },
      splashName: 'Returner lands', splashDesc: 'The returner comes down on land under its parachute, on the snowy grassland of Siziwang Banner, where the recovery teams find it by its beacon.',
      smSepBeforeEI: 30, smSepName: 'Returner separation', smName: 'Chang’e 5 orbiter (continues to Sun–Earth L1)',
      sepName: 'Probe separation', sepDesc: 'The probe separates from the Long March 5 second stage, already on its Earth–Moon transfer orbit.',
      undockName: 'Lander + ascender separate', undockDesc: 'The lander–ascender combination separates from the orbiter–returner, which stays in a 200 km lunar orbit.', liftoffName: 'Ascender liftoff (first Chinese launch from another world)', dockName: 'Robotic docking', dockDesc: 'First robotic rendezvous and docking in lunar orbit; the sample canister is transferred into the returner.', dsName: 'Chang’e 5 lander (Mons Rümker)', ascStageName: 'Ascender (deorbited)', ascJettisonName: 'Ascender released',
      scripted: [ // times after touchdown (15:11 UTC): the drilling was done by 20:53, the sampling sealed by 14:00 next day (CNSA); the flag before liftoff
        { when: 'surface', afterLanding: 1.0, name: 'Drilling', desc: 'The drill bores about a metre into the regolith. The core, in a flexible bag, is coiled up and sealed into the container on top of the ascender.', kind: 'info' },
        { when: 'surface', afterLanding: 6.0, name: 'Scooping', desc: 'The robotic arm scoops surface soil in several places and empties each scoop into the container on top of the ascender. Drill and scoop together: 1,731 g of regolith.', kind: 'info' },
        { when: 'surface', afterLanding: 46.0, name: 'Flag unfurled', desc: 'A Chinese flag, made of a composite fabric to survive the Moon’s heat and radiation, unfurls on its pole at the side of the lander — China’s first fabric flag on the Moon (earlier landers carried painted flags).', kind: 'photo' },
      ],
    },
  },
  // ------------------------------------------------------------------ MARS
  {
    id: 'mariner4', title: 'Mariner 4', year: 1965, agency: 'NASA / JPL', status: 'Flown', crewed: false, dest: 'mars', tag: 'Mars flyby (one-way)',
    blurb: 'The first successful Mars flyby and the first close-up photographs of another planet: 21 grainy images showing a cratered, Moon-like surface.',
    real: { 'Launch': '1964-11-28 14:22 UTC, Atlas-Agena D', 'Mars flyby': '1965-07-15 01:00 UTC', 'Closest approach': '9,846 km altitude', 'Images': '21 + 1 partial (8.33 bit/s downlink)', 'Spacecraft mass': '260.8 kg' },
    cfg: {
      name: 'Mariner 4', profile: 'mars-flyby', dest: 'mars', launcher: 'atlasAgena', spacecraft: 'mariner4', crew: 0, shipName: 'Mariner 4',
      site: 'CCSFS12', launch: '1964-11-28T14:22:01Z', parking: { hp: 185, ha: 190 }, tmiDelay: 0.75,
      legs: [{ body: 'mars', t: '1965-07-15T01:00:57Z', type: 'flyby', alt: 9846, name: 'Mars flyby — first close-up images', events: [{ dt: -0.45, name: 'Imaging sequence', desc: 'The TV camera records 21 pictures (plus part of a 22nd) onto tape. Each image will take about 10 hours to send home at 8.33 bits per second.', kind: 'photo' }, { dt: 1.2, name: 'Radio occultation', desc: 'Mariner 4 passes behind Mars as seen from Earth. The fading radio signal reveals a thin atmosphere — surface pressure only 4–7 mbar.', kind: 'info' }] }],
      coastAfter: 120, afterPhase: 'heliocentric orbit (still circling the Sun today)',
    },
  },
  {
    id: 'perseverance', title: 'Mars 2020 Perseverance', year: 2021, agency: 'NASA / JPL', status: 'Flown', crewed: false, dest: 'mars', tag: 'Direct entry & landing (one-way)',
    blurb: 'Atlas V launch, seven-month cruise, then the “seven minutes of terror”: 5.4 km/s entry, supersonic parachute, terrain-relative navigation and the sky crane lowering the rover into Jezero Crater.',
    real: { 'Launch': '2020-07-30 11:50 UTC, Atlas V 541', 'Launch mass': '4,060 kg', 'Entry': '2021-02-18 ≈20:38 UTC, ~5.4 km/s', 'Landing': '2021-02-18 20:55 UTC (Earth receive)', 'Site': 'Jezero Crater 18.445°N 77.451°E', 'Parachute': '21.5 m disk-gap-band, Mach ≈1.75' },
    cfg: {
      name: 'Mars 2020 Perseverance', profile: 'mars-landing', dest: 'mars', launcher: 'atlasV541', spacecraft: 'perseverance', crew: 0, shipName: 'Mars 2020 (Perseverance)',
      site: 'CCSFS41', launch: '2020-07-30T11:50:00Z', parking: { hp: 185, ha: 185 }, tmiDelay: 0.85,
      legs: [{ body: 'mars', t: '2021-02-18T20:38:00Z', type: 'entry', tLand: '2021-02-18T20:44:00Z', site: { lat: 18.4447, lon: 77.4508, elev: -2.57, name: 'Jezero Crater — Octavia E. Butler Landing' }, entry: { fpa: -15.5, alt: 125, bank: 30 }, sepBefore: 10 }],
      landName: 'Touchdown — Perseverance', surfaceDays: 33, cruiseName: 'Mars 2020 cruise stage',
      // first drive as flown on 4 March 2021 (JPL), then illustrative commutes; the real route is not modelled
      rover: { body: 'mars', top: 0.042, avg: 0.03, heading: 160, drives: [
        { sol: 14, name: 'First drive on Mars', desc: 'Perseverance drives 4 m forward, turns 150° to the left in place and backs up 2.5 m into a temporary parking spot — 6.5 m in about 33 minutes (4 March 2021).', moves: [['fwd', 4], ['turn', -150], ['back', 2.5]], pause: 780 },
        { sol: 16, turn: 35, dist: 20 }, { sol: 19, turn: -25, dist: 45 }, { sol: 22, turn: 40, dist: 70 }, { sol: 25, turn: -20, dist: 100 }, { sol: 28, turn: 25, dist: 110 }, { sol: 31, turn: -35, dist: 120 },
      ] },
      surfaceEvents: [{ afterLanding: 0.01, name: '“Touchdown confirmed!”', desc: 'JPL mission control receives confirmation 11 minutes after the rover actually landed — the radio signal’s travel time from Mars.', kind: 'info' }, { afterLanding: 2.5, name: 'First panoramas', desc: 'Mastcam-Z begins imaging the delta deposits of an ancient lake.', kind: 'photo' }],
    },
  },
  {
    id: 'tianwen1', title: 'Tianwen-1 / Zhurong', year: 2021, agency: 'CNSA', status: 'Flown', crewed: false, dest: 'mars', tag: 'Orbiter + landing (one-way)',
    blurb: 'China’s first Mars mission did everything at once: orbit, land and rove. After three months surveying the landing zone from orbit, the capsule landed Zhurong in Utopia Planitia.',
    real: { 'Launch': '2020-07-23 04:41 UTC, Long March 5', 'Mars orbit insertion': '2021-02-10 11:52 UTC', 'Parking orbit': '≈280 × 59,000 km, 86.9°, 2 sols', 'Landing': '2021-05-14 23:18 UTC', 'Site': 'Utopia Planitia 25.07°N 109.93°E', 'Mass': '5,000 kg' },
    cfg: {
      name: 'Tianwen-1', profile: 'mars-orbit-landing', dest: 'mars', launcher: 'lm5', spacecraft: 'tianwen1', crew: 0, shipName: 'Tianwen-1',
      site: 'WENCHANG', launch: '2020-07-23T04:41:15Z', parking: { hp: 200, ha: 210 }, tmiDelay: 0.6,
      legs: [{ body: 'mars', t: '2021-02-10T11:52:00Z', type: 'orbit', alt: 400, apo: 180000, incl: 10, moiName: 'Mars orbit insertion (capture)',
        trim: { after: 5, peri: 265, incl: 86.9, name: 'Plane change to a polar orbit', desc: 'At apoapsis, 180,000 km out, the orbiter swings its orbit plane over the poles so the ground track can reach the landing site.' },
        next: 'land', site: { lat: 25.066, lon: 109.925, elev: -4.1, name: 'Utopia Planitia' }, tLand: '2021-05-14T23:18:00Z', parkPeri: 280, parkApo: 59000, entryFpa: -11.5,
        orbitEvents: [{ t: '2021-03-04T00:00:00Z', name: 'High-resolution imaging of the landing zone', desc: 'HiRIC camera images the pre-selected landing area at 0.5–0.7 m per pixel.', kind: 'photo' }] }],
      landName: 'Touchdown — Zhurong lander', surfaceDays: 8, orbiterName: 'Tianwen-1 orbiter',
      roverOff: { wings: 0.6, ramp: 2.0, roll: 7.14 }, // days after touchdown; it drove off on 22 May 02:40 UTC (the first two approximate)
      surfaceEvents: [
        { afterLanding: 0.6, name: 'Zhurong unfolds', desc: 'The rover raises its body on its suspension, opens its four solar wings like a butterfly’s and lifts its mast and antenna. (Time approximate.)', kind: 'deploy' },
        { afterLanding: 2.0, name: 'Ramp unfolds', desc: 'Two rails swing down from the front of the landing platform and run out to the ground. (Time approximate.)', kind: 'deploy' },
        { afterLanding: 7.14, name: 'Zhurong rolls off the lander', desc: 'The 240 kg solar-powered rover drives down the ramp onto the surface of Utopia Planitia.', kind: 'info' },
      ],
    },
  },
  {
    id: 'msr', title: 'Mars Sample Return', year: 2031, agency: 'CNSA Tianwen-3-style architecture', status: 'Planned / concept', crewed: false, dest: 'mars', tag: 'Robotic landing & sample return',
    blurb: 'Concept based on the announced Tianwen-3 plan (launch window 2028, samples on Earth by 2031): land, drill, launch a Mars Ascent Vehicle, capture the sample in orbit, return the capsule to Earth. Simplified to a single launch.',
    real: { 'Status': 'Planned (Tianwen-3: two Long March 5 launches, 2028)', 'Return': '“by 2031” (CNSA)', 'Model note': 'Dates chosen by the minimum-energy transfer search' },
    cfg: {
      name: 'Mars Sample Return (concept)', profile: 'mars-landing-return', dest: 'mars', launcher: 'lm5', spacecraft: 'msrConcept', crew: 0, shipName: 'Sample-return stack',
      site: 'WENCHANG', launch: '2028-11-24T08:00:00Z', parking: { hp: 200, ha: 210 }, tmiDelay: 0.6, samples: 0.6,
      legs: [{ body: 'mars', t: '2029-09-22T07:00:00Z', type: 'entry', tLand: '2029-09-22T07:08:00Z', site: { lat: 25.1, lon: 109.9, elev: -4.1, name: 'Utopia Planitia (candidate)' }, entry: { fpa: -12.5, alt: 125, bank: 35 }, next: 'return', sepBefore: 30 },
        { body: 'earth', t: '2031-08-26T16:00:00Z', departMars: '2030-09-30T16:00:00Z', type: 'entry', site: { lat: 42.0, lon: 111.5, name: 'Siziwang Banner, Inner Mongolia' }, entry: { fpa: -10.5, alt: 125, bank: 30 }, sepBefore: 60, sepName: 'Earth entry capsule release' }],
      lmoAlt: 350, ascentLead: 8, surfaceDays: 370,
    },
  },
  {
    id: 'starshipMars', title: 'Crewed Mars — Starship', year: 2033, agency: 'SpaceX (concept)', status: 'Concept', crewed: true, dest: 'mars', tag: 'Crewed landing & return (conjunction class)',
    blurb: 'Concept profile: launch to LEO, refill with tanker flights, 6-month cruise, direct entry and propulsive landing, ~18 months on the surface making propellant from the Martian air and ice, then a direct launch home.',
    real: { 'Status': 'Concept (SpaceX architecture; not yet flown)', 'Vehicle': 'Super Heavy + Ship, Block 2 specs', 'Refilling': '≈8 tanker flights in Earth orbit', 'Stay': '≈560 days (conjunction class)', 'Return propellant': 'In-situ resource utilisation (Sabatier)' },
    cfg: {
      name: 'Crewed Mars — Starship (concept)', profile: 'mars-landing-return', dest: 'mars', launcher: 'starship', spacecraft: 'starshipCrew', crew: 6, shipName: 'Starship (crewed)', payloadMass: 100000,
      site: 'STARBASE', launch: '2033-03-10T15:00:00Z', parking: { hp: 200, ha: 210 }, refill: { days: 33, to: 1500000, tankers: 8 }, tmiDelay: 0.2,
      legs: [{ body: 'mars', t: '2033-10-22T16:00:00Z', type: 'entry', tLand: '2033-10-22T16:10:00Z', site: { lat: 40.8, lon: 150.0, elev: -4.0, name: 'Arcadia Planitia (candidate)' }, entry: { fpa: -11, alt: 125, bank: 20 }, next: 'return', sepBefore: 1 },
        { body: 'earth', t: '2035-11-24T16:00:00Z', departMars: '2035-05-10T15:00:00Z', type: 'entry', site: { lat: 25.99, lon: -97.15, name: 'Starbase, Texas' }, entry: { fpa: -6.2, alt: 125, bank: 40 }, sepBefore: 1 }],
      isru: { to: 1300000 }, lmoAlt: 250, ascentLead: 4,
      surfaceEvents: [{ afterLanding: 1.0, name: 'First human steps on Mars', desc: 'Surface gravity 0.38 g; air pressure under 1 % of Earth’s; the sky is butterscotch by day and blue at sunset.', kind: 'info' }],
    },
  },
  {
    id: 'starshipOrbit', title: 'Crewed Mars orbit & return', year: 2033, agency: 'Concept', status: 'Concept', crewed: true, dest: 'mars', tag: 'Crewed orbit & return (no landing)',
    blurb: 'Concept: a crew flies to Mars, captures into a high orbit, films and surveys the planet and its moons for the length of a conjunction-class stay, then fires for home — never touching the surface.',
    real: { 'Status': 'Concept profile', 'Vehicle': 'Starship (refilled in LEO)', 'Mars orbit': '≈250 × 33,000 km (1-sol)', 'Stay in orbit': '≈560 days' },
    cfg: {
      name: 'Crewed Mars orbit & return (concept)', profile: 'mars-orbit-return', dest: 'mars', launcher: 'starship', spacecraft: 'starshipCrew', crew: 4, shipName: 'Starship (orbital)', payloadMass: 50000,
      site: 'STARBASE', launch: '2033-03-10T15:00:00Z', parking: { hp: 200, ha: 210 }, refill: { days: 33, to: 1500000, tankers: 8 }, tmiDelay: 0.2,
      legs: [{ body: 'mars', t: '2033-10-22T16:00:00Z', type: 'orbit', alt: 250, apo: 33000, incl: 30, next: 'return', moiName: 'Mars orbit insertion',
        orbitEvents: [{ afterArrival: 2, name: 'Phobos close pass', desc: 'From the high elliptical orbit the crew films Phobos (22 km across) from a few thousand kilometres.', kind: 'photo' }, { afterArrival: 30, name: 'Global dust-storm watch', desc: 'Long-duration filming of weather systems, polar caps and Valles Marineris at dawn.', kind: 'photo' }] },
        { body: 'earth', t: '2035-11-24T16:00:00Z', departMars: '2035-05-10T15:00:00Z', type: 'entry', site: { lat: 25.99, lon: -97.15, name: 'Starbase, Texas' }, entry: { fpa: -6.2, alt: 125, bank: 40 }, sepBefore: 1 }],
    },
  },
  {
    id: 'inspirationMars', title: 'Inspiration Mars', year: 2018, agency: 'Inspiration Mars Foundation (concept)', status: 'Concept (not flown)', crewed: true, dest: 'mars', tag: 'Crewed Mars flyby & free return',
    blurb: 'Dennis Tito’s 2013 proposal: a married couple on a 501-day free-return flight around Mars, using the planet’s gravity to swing back to Earth with no major burn — and a record 14 km/s re-entry.',
    real: { 'Launch (proposed)': '2018-01-05', 'Mars flyby': '2018-08-20, close pass', 'Return': '2019-05-21, entry ≈14 km/s', 'Duration': '501 days', 'Crew': '2' },
    cfg: {
      name: 'Inspiration Mars (concept)', profile: 'mars-flyby-return', dest: 'mars', launcher: 'sls1', spacecraft: 'inspirationMars', crew: 2, shipName: 'Capsule + habitat',
      site: 'KSC39B', launch: '2018-01-05T12:00:00Z', parking: { hp: 185, ha: 190 }, tmiDelay: 0.7,
      legs: [{ body: 'mars', t: '2018-08-20T12:00:00Z', type: 'flyby', minAlt: 100, name: 'Mars flyby (gravity-assisted free return)', events: [{ dt: -2, name: 'Mars fills the window', desc: 'For a few hours the crew sees Mars grow from a bright star to a globe filling the window.', kind: 'photo' }] },
        { body: 'earth', t: '2019-05-21T12:00:00Z', type: 'entry', site: { lat: 33.0, lon: -122.0, name: 'Pacific off California' }, entry: { fpa: -7.4, alt: 125, bank: 40 }, sepBefore: 60, sepName: 'Capsule separation from habitat' }],
      tcmAfterFlyby: 10,
    },
  },
  // ------------------------------------------------------------------ EARTH ORBIT (Space Shuttle)
  {
    id: 'sts1', title: 'STS-1 Columbia', year: 1981, agency: 'NASA', status: 'Flown', crewed: true, dest: 'earth', tag: 'First Space Shuttle flight',
    blurb: 'The first Space Shuttle flight, and the first time NASA flew a crew on a new spacecraft’s maiden flight. John Young and Bob Crippen tested Columbia for 36 orbits, then glided home onto a dry lakebed in the Mojave Desert.',
    crewNames: 'John Young, Robert Crippen',
    real: { 'Launch': '1981-04-12 12:00:04 UTC, LC-39A', 'Ascent': 'Standard insertion: MECO T+8:34, OMS-1 T+10:34, OMS-2 T+44:02', 'Orbit': '≈ 241 km, raised to 273 × 276 km; 40.3°', 'Landing': '1981-04-14 18:20:57 UTC, Rogers Dry Lake Runway 23, Edwards AFB', 'Duration': '2 d 6 h 20 m 53 s, 36 orbits', 'External Tank': 'Painted white (STS-1 and STS-2 only)' },
    cfg: {
      name: 'STS-1', profile: 'leo-shuttle', dest: 'earth', launcher: 'shuttle', spacecraft: 'shuttle', crew: 2, shipName: 'Columbia (OV-102)', orbiterId: 'OV-102', lvVariant: 'sts1', bayPayload: 'dfi',
      site: 'KSC39A', launch: '1981-04-12T12:00:04Z', incl: 40.3, parking: { hp: 37, ha: 125, hCut: 118 }, etDry: 34500,
      ssme: { sched: [[0, 0.957], [27, 0.957], [29, 0.622], [52, 0.622], [55, 0.957]] }, negReturn: 245, pressToMeco: 385,
      oms1: { met: 690, ha: 244 }, oms2: { hp: 241 }, bayOpenMET: 1.45,
      orbitBurns: [{ met: 6.346, name: 'OMS-3 — orbit raise', ha: 276, desc: 'The first of two burns that lift Columbia to its working orbit.' }, { met: 7.092, name: 'OMS-4 — circularisation', hp: 273, desc: 'Half an orbit later the second burn rounds the orbit off.' }],
      scripted: [{ met: 1.6, name: 'Missing tiles on the OMS pods', desc: 'Television pictures of the open payload bay show gaps where sixteen heat-shield tiles came off the OMS pods during launch. The pods see little heating and engineers clear them, but the crew cannot see Columbia’s belly — its condition stays unknown until entry.', kind: 'photo' }, { met: 7.6, name: 'TV from orbit', desc: 'The crew shows the world the inside of the first reusable spacecraft, floating through the mid-deck and the flight deck.', kind: 'info' }],
      landing: '1981-04-14T18:20:57Z', runway: 'EDW23L', blackout: true, dragChute: false, ogs: 19, rollout: 2.741, orbitPhaseName: 'In orbit — flight tests',
      scOverride: { ORB: { name: 'Columbia (OV-102) with crew and consumables', dry: 84000 }, PAY: { name: 'Development Flight Instrumentation pallet', dry: 4600 }, OMS: { prop: 10800 } },
    },
  },
  {
    id: 'sts31', title: 'STS-31 Discovery — Hubble', year: 1990, agency: 'NASA / ESA', status: 'Flown', crewed: true, dest: 'earth', tag: 'Deploying the Hubble Space Telescope',
    blurb: 'Discovery carried the Hubble Space Telescope to about 615 km, the highest orbit any Shuttle reached. The robot arm lifted the 11-tonne telescope out of the bay, its solar arrays unrolled, and it was set free — where it still works today.',
    crewNames: 'Loren Shriver, Charles Bolden, Steven Hawley, Bruce McCandless II, Kathryn Sullivan',
    real: { 'Launch': '1990-04-24 12:33:51 UTC, LC-39B', 'MECO orbit': '611 × 89 km (330 × 48 nmi)', 'After OMS-2': '611 × 576 km (330 × 311 nmi), 28.5°', 'Hubble release': '1990-04-25 19:37:51 UTC', 'Landing': '1990-04-29 13:49:57 UTC, Edwards Runway 22', 'Duration': '5 d 1 h 16 m', 'Hubble mass': '≈ 10,900 kg' },
    cfg: {
      name: 'STS-31', profile: 'leo-shuttle', dest: 'earth', launcher: 'shuttle', spacecraft: 'shuttle', crew: 5, shipName: 'Discovery (OV-103)', orbiterId: 'OV-103', bayPayload: 'hst', bayPayloadReturn: null,
      site: 'KSC39B', launch: '1990-04-24T12:33:51Z', incl: 28.45, parking: { hp: 89, ha: 611, hCut: 112 }, etDry: 30000,
      ssme: { sched: [[0, 0.995], [18, 0.995], [19, 0.928], [28, 0.928], [29, 0.641], [59, 0.641], [61, 0.995]] }, negReturn: 250, pressToMeco: 390,
      oms2: { hp: 576 }, bayOpenMET: 1.4,
      orbitBurns: [{ met: 2.2, at: 'apo', name: 'OMS-3 — raise to deploy orbit', hp: 613, desc: 'Raises the low side of the orbit to about 613 km: the higher Hubble starts, the longer it lasts before air drag pulls it down.' }],
      deploy: { t: '1990-04-25T19:37:51Z', name: 'Hubble Space Telescope', short: 'Hubble', id: 'hst', model: 'hubble', mass: 10886, grapple: 8, unberth: 6.4, arrays: 2.6, doorOpen: '1990-04-27T13:30:00Z' },
      landing: '1990-04-29T13:49:57Z', runway: 'EDW22', blackout: false, dragChute: false, ogs: 19, rollout: 2.705, orbitPhaseName: 'In orbit',
      scOverride: { ORB: { name: 'Discovery (OV-103) with crew and consumables', dry: 84800 }, PAY: { name: 'Hubble Space Telescope', dry: 10886 }, OMS: { prop: 11400 } },
    },
  },
  {
    id: 'sts135', title: 'STS-135 Atlantis', year: 2011, agency: 'NASA', status: 'Flown', crewed: true, dest: 'earth', tag: 'Last Shuttle flight — docking with the ISS',
    blurb: 'The 135th and final Space Shuttle flight. Atlantis carried a year’s worth of supplies to the International Space Station in the Raffaello logistics module, stayed docked for eight days, flew a last lap around the station and landed at Kennedy before dawn.',
    crewNames: 'Chris Ferguson, Doug Hurley, Sandra Magnus, Rex Walheim',
    real: { 'Launch': '2011-07-08 15:29:04 UTC, LC-39A', 'MECO': 'T+8:24, then OMS-2 at T+37:45 → 158 × 229 km', 'Docking': '2011-07-10 15:07 UTC, PMA-2 on Harmony', 'Undocking': '2011-07-19 06:26 UTC', 'Landing': '2011-07-21 09:57:00 UTC, KSC Runway 15 (night)', 'Duration': '12 d 18 h 28 m', 'ISS orbit': '≈ 383 × 390 km, 51.6°' },
    cfg: {
      name: 'STS-135', profile: 'leo-shuttle', dest: 'earth', launcher: 'shuttle', spacecraft: 'shuttle', crew: 4, shipName: 'Atlantis (OV-104)', orbiterId: 'OV-104', bayPayload: 'mplm',
      site: 'KSC39A', launch: '2011-07-08T15:29:04Z', incl: 51.6, parking: { hp: 58, ha: 225, hCut: 105 },
      ssme: { sched: [[0, 1], [35, 1], [36, 0.69], [47, 0.69], [48, 1]] }, headsUpMET: 345, negReturn: 234, pressToMeco: 374,
      oms2: { hp: 158 }, bayOpenMET: 1.4,
      iss: { dock: '2011-07-10T15:07:15Z', rpm: '2011-07-10T14:05:20Z', undock: '2011-07-19T06:25:45Z', hp: 383, ha: 390, mass: 420000, crew: 6, mplmOut: '2011-07-11T11:30:00Z', mplmIn: '2011-07-18T12:30:00Z', mplmName: 'Raffaello' },
      landing: '2011-07-21T09:57:00Z', runway: 'KSC15', blackout: false, dragChute: true, ogs: 18, rollout: 2.84, orbitPhaseName: 'In orbit',
      scOverride: { ORB: { name: 'Atlantis (OV-104) with crew and consumables', dry: 91500 }, PAY: { name: 'Raffaello logistics module (loaded)', dry: 12900 }, OMS: { prop: 11000 } },
    },
  },
  // ------------------------------------------------------------------ GRAVITY ASSIST
  {
    id: 'europaClipper', title: 'Europa Clipper (MEGA)', year: 2024, agency: 'NASA / JPL', status: 'In flight', crewed: false, dest: 'mars', tag: 'Mars & Earth gravity assists',
    blurb: 'NASA’s largest planetary spacecraft could not reach Jupiter directly. It borrows energy from Mars (March 2025) and Earth (December 2026) — a Mars–Earth Gravity Assist (MEGA) trajectory.',
    real: { 'Launch': '2024-10-14 16:06 UTC, Falcon Heavy (expendable)', 'Mars flyby': '2025-03-01 17:57 UTC, 884 km', 'Earth flyby': '2026-12-03 ≈21:15 UTC', 'Jupiter arrival': '2030-04-11', 'Mass': '6,065 kg (2,750 kg propellant)' },
    cfg: {
      name: 'Europa Clipper', profile: 'multi-flyby', dest: 'mars', launcher: 'falconHeavy', spacecraft: 'europaClipper', crew: 0, shipName: 'Europa Clipper',
      site: 'KSC39A', launch: '2024-10-14T16:06:00Z', parking: { hp: 185, ha: 190 }, tmiDelay: 0.6,
      legs: [{ body: 'mars', t: '2025-03-01T17:57:00Z', type: 'flyby', minAlt: 300, name: 'Mars gravity assist', events: [{ dt: -0.3, name: 'Infrared images of Mars', desc: 'The thermal imager (E-THEMIS) is tested on Mars during the flyby.', kind: 'photo' }] },
        { body: 'earth', t: '2026-12-03T21:15:00Z', type: 'flyby', minAlt: 300, name: 'Earth gravity assist' },
        { body: 'jupiter', t: '2030-04-11T00:00:00Z', type: 'design' }],
      coastAfter: 150, afterPhase: 'cruise to Jupiter', endNote: { name: 'Onward to Jupiter', desc: 'After the Earth flyby the craft climbs to Jupiter’s orbit, arriving in April 2030 for 49 flybys of Europa.' }, tcmAfterFlyby: 12,
    },
  },
];
function scenarioById(id) { return SCENARIOS.find(s => s.id === id); }
function planScenario(cfg, progress) {
  if ((cfg.profile || '').startsWith('leo')) return planLEO(cfg, progress);
  if (cfg.dest === 'moon' || (cfg.profile || '').startsWith('lunar')) return planLunar(cfg, progress);
  return planInterplanetary(cfg, progress);
}
