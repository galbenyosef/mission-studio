# JWST mission scenario — Ariane 5 from Kourou, transfer to Sun–Earth L2, halo orbit

## Goal

Add the James Webb Space Telescope mission to the scenario list: launch on Ariane 5 ECA from Kourou ELA-3 on 2021-12-25 12:20 UTC, direct injection toward Sun–Earth L2, the three mid-course corrections, the two-week deployment of the sunshield and mirror on the way, L2 insertion on 2022-01-24, and one circuit of the halo orbit (about six months) kept with station-keeping burns every three weeks, as the real telescope flies it. Seen in a Sun–Earth rotating frame the path is the halo.

## What is new

The existing planners cover the Moon and the planets (Lambert legs, patched conics, B-planes). Nothing targets a libration point, and the scene has no Sun–Earth rotating frame. Four new pieces, in the order they are built:

1. **The launcher and the site** — `ariane5ECA` and `KOUROU3` in `src/vehicles.js`, an ELA-3 pad in `app/46_pads.js`, the launcher drawn by hand in `app/3b_launchers.js`.
2. **The spacecraft** — `jwst` in `SPACECRAFT`, drawn by hand in a new `app/3c_jwst.js` with its deployment animated from the mission's events.
3. **The L2 planner** — a new `src/halo.js` (`planHalo(cfg, progress)`), chosen by `planScenario` for `cfg.profile === 'l2-halo'`.
4. **The rotating frame and the scene** — a `serot` frame beside `emrot`, the L2 point marked, the director and minimap aware of a craft 1.5 million km out.

## 1. Launcher and site

`LAUNCHERS.ariane5ECA` (heights and masses from Arianespace's user manual; the look is approximate):

| Stage | Propellant | Thrust (SL / vac) | Isp | Dry / propellant | Geometry |
|---|---|---|---|---|---|
| EAP × 2 (parallel, `booster: { count: 2, offset: 4.3 }`) | solid | 2 × 6 470 / 7 080 kN, with a thrust curve (peak at ~20 s, tail-off at 130 s) | 275 s | 2 × 33 t / 2 × 237 t | 31.2 m × 3.05 m, conical nose; aft skirt |
| EPC (core, Vulcain 2, lit at H0, boosters at H0 + 7 s) | hydrolox | 960 / 1 390 kN | 318 / 432 s | 14.7 t / 173 t | 30.5 m × 5.4 m |
| ESC-A (HM7B, one engine, restartable: false) | hydrolox | — / 67 kN | 446 s | 4.5 t / 14.9 t | 4.7 m × 5.4 m |

Fairing 17 m × 5.4 m, jettisoned at 110 km (L+3:20). `PAD_IGNITION.ariane5ECA = { t: 7.3, ramp: 3.0 }` — the Vulcain lights at H0 and is checked for seven seconds before the boosters light and the vehicle leaves (Arianespace flight sequence). Ascent targets `{ hp: 170, ha: 170 }` so the ESC-A's burn is the injection; `vert: 6`. The stage looks `ariane5EAP`, `ariane5EPC`, `ariane5ESC`: white with the blue bands of the real livery, the EPC's foam-covered tank off-white, EAP nose cones white with the dark separation ring, Vulcain 2 under the core, HM7B inside the ESC-A skirt. Lettering in plain type only ("ariane 5" in lower case is the livery's style; no ESA or CNES logos).

`LAUNCH_SITES.KOUROU3 = { name: 'Guiana Space Centre ELA-3, Kourou', lat: 5.2392, lon: -52.7685, azRange: [-10.5, 93.5] }`. JWST launched on an azimuth of about 90°.

**ELA-3 pad** (`padELA3`): the launch table (a 900-t steel platform 25 × 21 m with the 58-m umbilical mast standing on it, rolled out from the final-assembly building on its rails), the concrete launch zone with its three flame trenches (two for the boosters under the table's sides, one for the core), the water tower 90 m tall, the four lightning masts 70 m tall at the corners of the zone, the rails running 2.8 km west toward the BAF (the building itself drawn as a plain block 90 m tall, grey-white), the jungle green ground and the two concrete roads. Animation: none (the arms stay on the mast). `trenchD` 40, three-trench smoke handled by the existing pad cloud (two side jets plus the centre). No terrain data exists for Kourou (not in any public-domain source we use), so the ground is the pad's flat scrub as at Wenchang.

## 2. The spacecraft

`SPACECRAFT.jwst`: one module `OBS` (dry 6 161 kg at launch including 300 kg of propellant: hydrazine for attitude and MMH/NTO for the SCAT thrusters used for the corrections and station-keeping; engine `{ name: 'SCAT (4 × 22 N)', thrust: 88, isp: 295, prop: 'mmh' }`), `model: 'jwst'`, `len: 8` stowed.

**Model** (`app/3c_jwst.js`, `buildJWST(cfgDeploy)`): the spacecraft bus (a dark 3.5 × 3.5 × 1.5 m box with the solar array of five panels, the high-gain antenna, the momentum flap); the deployable tower assembly (DTA, 1.2 m extended); the sunshield: five layers of aluminised Kapton, a 21.2 × 14.2 m kite, each layer a plane with its own slight tilt, silver on the Sun side and a faint purple-pink (the doped-silicon coating) on the telescope side, stretched from the two unitised pallet structures (UPS) and the mid-booms; the optical telescope element: 18 gold hexagonal segments (1.32 m flat to flat) in the 6.5-m primary, three on each wing that fold back, the secondary mirror on its three-strut tripod 7 m ahead, the aft optics subsystem and the ISIM radiator behind. Materials: gold (existing `gold` material, roughness 0.3), the foil texture for the Kapton, dark for the bus.

**Deployment** is a sequence of named steps with the mission's own times (from the JWST deployment timeline), each animated over its duration by `animate(t)` with a smoothstep:

| Step | Starts (after launch) | Takes |
|---|---|---|
| Solar array | +31 min | 2 min |
| High-gain antenna | +1 d | 10 min |
| Forward sunshield pallet | +3 d | 4 h |
| Aft sunshield pallet | +3.3 d | 4 h |
| DTA extension | +4 d | 6.5 h |
| Momentum flap | +5 d | 10 min |
| Sunshield covers roll up | +6 d | 2 h |
| Port and starboard mid-booms | +7 d | 6 h |
| Sunshield tensioning, layer 1 … 5 | +8 d, +9 d, +9.3 d, +10 d, +10.3 d | 2 h each |
| Secondary mirror tripod | +11 d | 2 h |
| Aft deployed radiator | +12 d | 10 min |
| Port primary wing | +13 d | 3 h |
| Starboard primary wing | +14 d | 3 h |

The steps are events in the mission (`M.ev`, kind `deploy`), so the captions, the key-events list and the director see them; `animate(t)` reads the same list from `cfg`. The stowed configuration at launch fits the 4.57-m fairing: sunshield folded against the bus, mirror wings folded back, tower retracted, secondary tripod folded over the primary.

## 3. The L2 planner (`src/halo.js`)

Frames: the Sun–Earth rotating frame has x̂ from the Sun through the Earth (toward L2), ẑ the ecliptic normal, ŷ completing it, centred on the Earth, turning at the Earth's instantaneous angular rate about the Sun (`seRot(t)` from the Earth's heliocentric state, as `emRot` does for the Moon). L2 lies on x̂ at about 1.5 million km (solved from the CR3BP quintic with the Sun : Earth+Moon mass ratio).

**Reference halo**: a northern L2 halo in the circular restricted three-body problem, Az = 350 000 km (JWST's orbit is a large quasi-halo with an out-of-plane amplitude of a few hundred thousand kilometres; the exact figures are not published and the station-keeping absorbs the difference), from Richardson's third-order analytical approximation refined by differential correction to a periodic orbit (period ≈ 178 days). Computed once in nondimensional units and cached; `haloRef(t)` returns the reference position and velocity in geocentric ecliptic coordinates at time t by scaling with the Earth's distance from the Sun that day and rotating with `seRot(t)`, the phase chosen so that the craft arrives at the point of the halo closest to the Earth, which keeps the Earth–Sun angle small for communications and the sunshield.

**Dynamics**: the existing cislunar ODE (`makeCislunarODE`: Earth + Moon + Sun point masses, geocentric, in `src/integrator.js`), used by the lunar planner, with the Dormand–Prince integrator. The whole flight is integrated, no conics.

**Steps** (`planHalo`):

1. Launch: `launchPhase` into a 170-km parking orbit on an azimuth that contains the L2 direction (a plane through the site and the outgoing direction, as the interplanetary planner does), then the ESC-A's injection burn at the first periapsis passage, about 25 minutes after liftoff as flown. The burn's Δv (3 components) is solved by Newton so that the integrated state 29 days later sits 50 000 km short of the reference halo point, along the Earth–L2 line: the real injection was deliberately slightly low, because the telescope can only thrust away from the Sun (its sunshield must never face the engines' way), so every correction adds energy.
2. MCC-1a at L+12.5 h and MCC-1b at L+2.5 d: each solved by Newton to reach the arrival point at L+29 d exactly; expected sizes of order 20 m/s and 3 m/s. Both are burns of the SCAT thrusters (`BurnSeg`, direction from the solved Δv).
3. Coast to arrival with the deployment events on the way; phase 'transfer to L2'.
4. MCC-2 at L+29 d (2022-01-24 19:00 UTC): the halo insertion, solved so that the state 21 days later matches the reference halo's position at that time; expected size a few m/s.
5. Halo: station-keeping nodes every 21 days for 189 days (nine burns, one circuit and a bit); each solved to reach the reference position at the next node. Each burn is an event `Station-keeping burn n (x.x m/s)`; the total is reported in the summary (`M.summary.halo = { az, period, dvTotal }`). Phase 'halo orbit about L2'.
6. End: a note that the telescope keeps its orbit this way for its twenty years; `coastAfter` 10 days.

Solver: `newtonSolve` from `src/planner.js` (finite differences), unknowns the three Δv components, residual the position miss at the target time in units of 1 000 km, `maxStep` 0.05 km/s for the injection and 0.005 km/s for the corrections. If a solve fails to converge the planner records a warning and keeps the best point, as the other planners do.

Propellant: the burns draw on the OBS module through `Propulsion`, so the telemetry shows the propellant left (about 300 kg at launch; the real mission used far less than budgeted because the launch was so accurate).

**What is approximate**: the halo is a CR3BP orbit mapped into the real ephemeris, so the station-keeping burns absorb the mismatch (expected a few m/s each; the real ones are 1–2 m/s); the Moon's effect on the transfer is included by the integrator; solar radiation pressure is not modelled. The first-day thrusting-away-from-the-Sun constraint is represented only by the deliberately low injection.

## 4. Rotating frame and scene

- `serot` frame: `seRot(t)` beside `emRot(t)`; `frameOrigin`, `toFrame` and the trail builder treat it as `emrot` with the Sun–Earth matrix; the frame menu gains "Sun–Earth rotating"; `chooseAutoFrame` picks `serot` for a craft more than 600 000 km from the Earth when the mission's `cfg.profile` is `l2-halo` (the halo is the thing to see). The osculating orbit is hidden in `serot` as in `emrot`.
- The L2 point: a small marker and label (like the body labels) at the L2 position, shown in the `serot` frame and when the camera is more than 200 000 km from the Earth; computed in `halo.js` (`l2Point(t)`), drawn in `app/40_missionview.js`.
- Minimap: the Earth–Moon panel already shows the Moon's orbit; for this mission it shows the Sun direction and L2 at 1.5 million km with the halo trail (the panel's scale from `md.cfg.profile`).
- Director: nothing new is required — the auto camera already frames a craft far from any body; a 'from L2' preset is not added.

## 5. Scenario entry (`src/scenarios.js`)

```
id: 'jwst', title: 'James Webb Space Telescope', year: 2021, agency: 'NASA / ESA / CSA', status: 'In operation', crewed: false, dest: 'l2',
tag: 'Transfer to Sun–Earth L2 and halo orbit',
real: { 'Launch': '2021-12-25 12:20 UTC, Ariane 5 ECA (VA256), Kourou', 'MCC-1a': 'L+12.5 h, 20 m/s', 'MCC-1b': 'L+2.5 d, 2.8 m/s', 'L2 insertion (MCC-2)': '2022-01-24, 1.6 m/s', 'Halo period': '≈ 6 months', 'Mass': '6,161 kg' },
cfg: { profile: 'l2-halo', dest: 'l2', launcher: 'ariane5ECA', spacecraft: 'jwst', site: 'KOUROU3', launch: '2021-12-25T12:20:00Z', parking: { hp: 170, ha: 170 }, tmiDelay: 0.4,
  arrive: '2022-01-24T19:00:00Z', halo: { az: 350000, skDays: 21, circuits: 1.05 }, deploy: JWST_DEPLOY }
```

`JWST_DEPLOY` is the deployment table of section 2 as `[{ key, name, at (seconds after launch), dur (seconds) }]`, defined once in `src/scenarios.js` and read by both the planner (events) and the model (animation).
```
```

`dest: 'l2'` is new: the scenario list's destination filter gets an "L2" group; `planScenario` routes `profile === 'l2-halo'` to `planHalo`. The telemetry's "distance from Earth" and the Sun angle already exist.

## Testing

- `test/halo.test.js` (the existing `npm test` runner): plan the scenario and assert — the injection C3 is between −0.8 and −0.4 km²/s²; the arrival point at L+29 d is within 60 000 km of L2; each station-keeping burn is under 10 m/s and the total under 40 m/s; the craft stays between 1.2 and 1.9 million km from the Earth for the whole halo phase; the deployment events are in order and all before L+15 d; no planner warnings.
- The existing continuity test (segment junctions) covers the new segments.
- Visual check: renders of the launch (pad, flame), the deployment at L+5, L+9, L+14 d, and the halo in the `serot` frame at L+60 and L+180 d, with the probe script.

## Out of scope

Kourou terrain (no public-domain source), a detailed BAF, solar radiation pressure, the telescope's science operations, the instrument cool-down, and the Earth's view of the telescope (invisible at 1.5 million km).
