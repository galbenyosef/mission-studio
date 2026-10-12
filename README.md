# Mission Studio

**A 3D simulator of real space missions — the Space Shuttle, the Moon and Mars — that runs in your browser.** Pick a mission and watch it fly, from the countdown on the pad to landing. On-screen numbers explain every moment: payload, rocket size, propellant, gravity, acceleration, orbits and gravity assists. It was built for storyboarding a solar-system film, so the cameras, lenses and shot capture work like a film tool.

[**▶ Open the simulator**](https://sanghyunpark.pages.dev/apps/mission-studio/) · [Watch the 1-minute video](https://www.youtube.com/watch?v=RXN-PMDKZEs) · [About the project](https://sanghyunpark.pages.dev/projects/mission-studio/) · [한국어 안내](README.ko.md)

[![Watch the 1-minute video on YouTube: Apollo 11's launch, the lunar landing, Perseverance on Mars and Europa Clipper's flyby of Mars](media/video-en.jpg)](https://www.youtube.com/watch?v=RXN-PMDKZEs)

## What you can do

- **Choose a mission or build your own.** There are 16 presets based on flown and planned missions. Before the flight starts you can change:
  - the launch vehicle
  - the launch date and site
  - the parking orbit
  - the flight times
  - the lunar orbit altitude
  - the landing site and surface stay
  - the crew
  - for the Space Shuttle: the orbit, the payload in the bay, the OMS propellant, the landing runway and the drag chute
- **Watch the whole voyage.** The simulation includes:
  - the launch pads as they stood on each launch day: Launch Complex 39A and 39B with their Apollo, Shuttle, Artemis and Falcon Heavy towers, the swing arms pulling away, and SLC-41, LC-12, Wenchang and Starbase
  - liquid engines lighting on the pad before T−0 and the hold-down release
  - the ascent, with the Saturn V's roll program, staging and fairing jettison
  - the exhaust in the air: the plume swelling as the air thins, and the trail left through the atmosphere, which spreads, drifts and twists on the winds and fades over half an hour. Sunlight reaches it through the air, red at dawn and dusk; after sunset the exhaust high up is still in sunlight and glows against the night sky (the "twilight phenomenon")
  - the parking orbit and the transfer burns
  - flybys and gravity assists
  - entry, parachutes and the sky crane
  - powered landings, rover drives, lunar ascent and rendezvous
  - the return home
  - the Space Shuttle: the roll program, booster separation and the falling External Tank, OMS burns, the payload bay doors opening and closing, docking with the International Space Station or the robot arm lifting the Hubble Space Telescope out of the bay and letting it go, a gliding entry that steers with roll reversals, and the landing on a runway
- **Read the numbers as they change.**
  - Altitude and speeds (inertial, over the surface, vertical) and the g-load felt.
  - Thrust and acceleration, propellant left and the Δv budget for each stage.
  - The pull of each body (Earth, Sun, Moon, Jupiter …) and the radio delay.
  - A plain-language explanation for every phase.
- **See when the engines fire.**
  - Engine burns are drawn as thick orange ribbons and coasting as thin blue lines.
  - The same colours are used on the 3D paths, the Solar System map and the timeline.
- **Direct the camera.**
  - An auto-follow "director" mode, plus orbit, chase, look-at, ground and top-down cameras.
  - Lenses from 12 to 3200 mm and film aspect-ratio guides (2.39:1, 1.85:1 …).
  - Drag to orbit and scroll or pinch to zoom.
- **Build a storyboard.** The **Shot** button saves a frame with a slate (mission time, camera, lens, telemetry) to a shot list. You can view the list as a contact sheet or copy it as text.
- **Hear it.** All sound is synthesised live in the browser:
  - engine roar, air rush and re-entry
  - parachutes and the rover's motors
  - countdown beeps, separations and touchdowns
  - an optional ambient score

  Turn it on with the speaker button or <kbd>M</kbd>. Tick **Silent in vacuum** if you want engines firing outside an atmosphere to make no sound, as in real space.

![Saturn V ignition on Launch Complex 39A, with live telemetry, the countdown and the event list](media/screenshot-ignition.jpg)

| | |
|---|---|
| ![STS-135: Atlantis docked to the International Space Station](media/screenshot-iss.jpg) | ![STS-135: Atlantis touching down on Runway 15 at Kennedy before dawn, drag chute out](media/screenshot-landing.jpg) |
| ![Trans-lunar injection: the burn as an orange ribbon over Earth](media/screenshot-tli.jpg) | ![Perseverance on Mars: wheel tracks and its shadow](media/screenshot-rover.jpg) |
| ![Europa Clipper flying past Mars for a gravity assist](media/screenshot-clipper.jpg) | ![Apollo 11 arriving at the Moon for lunar orbit insertion](media/screenshot-loi.jpg) |

## Missions

| Mission | Year | Launch vehicle | Profile | Status |
|---|---|---|---|---|
| STS-1 Columbia | 1981 | Space Shuttle | First Shuttle flight, landing on Rogers Dry Lake | Flown |
| STS-31 Discovery | 1990 | Space Shuttle | Hubble Space Telescope deploy | Flown |
| STS-135 Atlantis | 2011 | Space Shuttle | Docking with the ISS, last Shuttle flight | Flown |
| Apollo 8 | 1968 | Saturn V | Crewed lunar orbit & return | Flown |
| Apollo 11 | 1969 | Saturn V | Crewed landing & return | Flown |
| Apollo 13 | 1970 | Saturn V | Free-return abort (flyby) | Flown |
| Artemis II | 2026 | SLS Block 1 | Crewed lunar flyby (free return) | Flown |
| Chang'e 5 | 2020 | Long March 5 | Robotic landing & sample return | Flown |
| Mariner 4 | 1965 | Atlas LV-3 Agena-D | Mars flyby | Flown |
| Mars 2020 Perseverance | 2020–21 | Atlas V 541 | Mars entry, sky crane landing, rover drives | Flown |
| Tianwen-1 / Zhurong | 2020–21 | Long March 5 | Mars orbiter + landing | Flown |
| Europa Clipper (MEGA) | 2024 | Falcon Heavy | Mars and Earth gravity assists | In flight |
| Mars Sample Return | 2031 | Long March 5 | Robotic landing & sample return | Planned / concept |
| Crewed Mars — Starship | 2033 | Starship | Crewed landing & return (conjunction class) | Concept |
| Crewed Mars orbit & return | 2033 | Starship | Crewed orbit & return | Concept |
| Inspiration Mars | 2018 | SLS Block 1 | Crewed Mars flyby & free return | Concept (not flown) |

## How it works

Each flight is calculated from physics, not keyframed. The planner solves the mission when you press **Fly this mission**, inside a Web Worker. The renderer then plays the result back.

- **Ephemerides.** Planet positions use JPL's approximate Keplerian elements (valid 1800–2050). The Moon uses a truncated Meeus/ELP2000 series. Body orientation uses the IAU WGCCRE rotation models. The frame is J2000 ecliptic.
- **Ascent.** Each stage is integrated numerically. The stack flies a gravity turn through the dense atmosphere; after max-Q, closed-loop insertion guidance eases in as the air thins (dynamic pressure × angle of attack is capped), so the vehicle keeps a steady attitude when a stage drops away. The vehicle data are real: thrust at sea level and in vacuum, Isp, dry mass and propellant. The atmosphere uses the US-1976 model, and drag is modelled for the stack.
- **Earth–Moon flights.** These are integrated with a Dormand–Prince 5(4) integrator in an Earth + Moon + Sun force field. Burns are finite and targeted with Newton iterations.
- **Interplanetary flights.** These use patched conics. Departures are Lambert solutions and flybys use B-plane targeting. The planet-centred hyperbola and the heliocentric arc join at the sphere of influence.
- **Space Shuttle flights.**
  - Orbits include Earth's oblateness (J2), which swings a low orbit's plane several degrees a day.
  - The ascent follows the main engines' throttle schedule and the 3 g limit, and cuts off on the flight's real MECO orbit; the OMS burns are finite.
  - For the ISS, the phasing burns are solved so that docking and landing fall at the historical times.
  - Entry guidance steers by bank angle, with roll reversals, toward the runway. The approach then flies the heading alignment cone, the steep outer glideslope and the flare onto the runway. After the main wheels touch, the nose comes down until the nose wheels touch: on its gear the orbiter stands 4.4° nose down, as the scan of Discovery shows.
- **Landing.**
  - Mars entry has a parachute and a sky crane.
  - Capsules fly a lifting entry.
  - Starship enters belly-first, then lights its engines as late as it can and flips upright onto them. On Mars the thin air leaves it still moving at several times the speed of sound, so it brakes tail-first into the airflow (supersonic retropropulsion) before the flip.
  - Powered descent uses ZEM/ZEV guidance.
- **Propellant.** It is tracked with the rocket equation, stage by stage, so the Δv budget always adds up.
- **Air and light.** Earth's and Mars's atmospheres are drawn from a physical model: Rayleigh and Mie scattering with ozone absorption, single scattering plus an approximation of the higher orders (Bruneton & Neyret 2008, Hillaire 2020). The same model draws the sky from the ground and the glowing limb from orbit. It also gives the haze over distant ground, the sunlight that reddens towards the terminator and the light the sky sheds on the ground. On Earth, clouds float on a layer 6 km up and cast shadows, the sea glints, and towns light up after dusk. On Mars, dust gives a butterscotch sky with a blue glow around the setting Sun. The terrain of Earth, the Moon and Mars is lit by its real slopes.
- **Exhaust in the air.** The trail's thickness follows the propellant each stage burns per metre of path (solid boosters leave the most smoke, hydrogen engines the least), its spread the thinning air, and its drift a wind profile drawn for the launch: the jet stream, and winds turning with height higher up. Each part of it is lit by sunlight that has crossed the air on the way, so it reddens near the shadow of the Earth and is dark inside it.

### Accuracy

This is a storyboard and teaching tool, not mission-design software.

- Trajectories are solved again from the mission inputs, so event times are close to the flown missions but not identical. For example, Apollo 11's touchdown comes out at about 103 h 37 m after liftoff, against 102 h 45 m in reality. The Shuttle landings come within a few minutes of the real ones: STS-1 about a minute late, STS-135 under two minutes late and STS-31 five and a half minutes early.
- The International Space Station is placed where Atlantis meets it, at its real altitude and inclination. Its position along the orbit before the rendezvous is not the historical one.
- After Perseverance's first drive, which matches the real one on 4 March 2021, the rover's daily drives are illustrative.
- The concept missions follow published architectures and their stated assumptions.
- The launch pads are drawn from published dimensions and photographs. Where nothing is published, such as the length of a swing arm or where a tank stands, the figure is read from photographs.

## Run it locally

You need [Node.js](https://nodejs.org/) 18 or later and a browser with WebGL 2.

```bash
git clone https://github.com/sean-lab/mission-studio.git
cd mission-studio
node build.js                         # → dist/
python3 -m http.server -d dist 8000   # or: npx serve dist
# open http://localhost:8000
```

The page must be served over HTTP, because opening the file directly blocks the texture loads and the Web Worker. Every path in `dist/` is relative, so the folder works from any base path. To publish a release, bump `version` in `package.json` and push to `main`. `.github/workflows/release.yml` then tags the commit and attaches `mission-studio-v<version>.tar.gz` (the contents of `dist/`) to a GitHub Release.

Engine tests (Node, no browser):

```bash
node test/t_core.js      # ephemerides vs. Meeus examples, Kepler/Lambert round trips
node test/t_ascent.js    # ascent solutions for every launcher
node test/t_lunar.js     # Earth–Moon profiles
node test/t_mission.js   # complete missions
```

### Project layout

```
src/      flight engine (plain JavaScript; also runs in a Web Worker)
app/      renderer and UI (ES module), markup and styles
assets/   planet maps, the star catalogue and the detailed vehicle models
vendor/   three.js r160 with its glTF loader and the meshopt decoder (MIT)
tools/models/  builds the detailed models in assets/ from NASA 3D Resources and free Sketchfab models (see its README)
tools/textures/  builds the planet maps in assets/ from NASA and Solar System Scope sources (see its README)
test/     Node tests for the engine
media/    screenshots for this README
```

## Credits

- **three.js** r160 ([MIT](vendor/three.LICENSE)), included in `vendor/` with its glTF loader. The meshopt decoder in `vendor/` is from [meshoptimizer](https://github.com/zeux/meshoptimizer) (MIT).
- **Apollo lunar module and Mars 2020 Perseverance:** 3D models from [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources), prepared by `tools/models`. The lunar module is split into its ascent and descent stages. Perseverance's six wheels and its mast are split off so the wheels turn and the mast stands up on the surface. Both are simplified and compressed.
- **Space Shuttle orbiter:** the Smithsonian's [3D scan of Discovery](https://sketchfab.com/3d-models/orbiter-space-shuttle-ov-103-discovery-5f7176a2ae284d6b99fc970c9d265c04) (OV-103) at the National Air and Space Museum's Udvar-Hazy Center, released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/). `tools/models` cuts it into the body, the two payload bay doors and the landing gear, so the doors open in orbit and the gear comes down for landing. The payload bay's lining, the robot arm and the payloads are drawn in code.
- **International Space Station:** NASA's model by the IGOAL lab at Johnson Space Center, from [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources). `tools/models` sets it back to July 2011 for STS-135, without the modules and arrays added since (Nauka, Prichal, the iROSA arrays, BEAM, the Bishop airlock and the docking adapters), and simplifies it.
- **Saturn V:** based on ["Saturn V"](https://sketchfab.com/3d-models/saturn-v-88f68de3b3e9435582560e02a52b325d) by [BoldlyBuilding](https://sketchfab.com/TitanicKyle), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). `tools/models` cuts it into the S-IC, the S-II's aft interstage, the S-II and the S-IVB, and stretches each to its published length and diameter. The interstage drops away 30 s after staging, as on the real flights. The model's own spacecraft is replaced by the app's Apollo spacecraft.
- **Space Shuttle external tank and boosters:** based on ["Space Shuttle Atlantis"](https://sketchfab.com/3d-models/space-shuttle-atlantis-2f04130e3c78439d9765b5ac71b333d2) by [paburoviii](https://sketchfab.com/paburoviii), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). `tools/models` keeps the tank and one booster (the app mirrors it for the other side) and scales them to their published sizes. It paints the tank's sprayed foam and weathers the boosters' paint, so they match the scanned orbiter they fly with.
- **Apollo command and service modules, other launch vehicles:** drawn in code from published dimensions.
- **Launch pads:** drawn in code from published dimensions and photographs: NASA and Kennedy Space Center fact sheets, the Historic American Engineering Record's documentation of Launch Complex 39, *Moonport* (NASA SP-4204), the NSTS News Reference Manual, and ULA, SpaceX and CASC material.
- **Earth maps:** NASA Earth Observatory's [Blue Marble: Next Generation](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/) (April 2004, by Reto Stöckli) for the ground. Its GEBCO_08 topography and bathymetry give the relief and the sea. The night lights are NASA's [Black Marble 2016](https://science.nasa.gov/earth/earth-observatory/) (Suomi NPP VIIRS). The clouds are from [Solar System Scope](https://www.solarsystemscope.com/textures/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). `tools/textures` prepares them.
- **Moon maps:** NASA Scientific Visualization Studio's [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720) (Ernie Wright), from the Lunar Reconnaissance Orbiter's LROC colour mosaic and LOLA elevation.
- **Mars maps:** the colour is from [Solar System Scope](https://www.solarsystemscope.com/textures/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), made a little less saturated. The relief comes from Mars Global Surveyor MOLA elevation ([NASA PDS Geosciences Node](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html)).
- **Venus, Jupiter and Saturn maps:** [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources), resized.
- **Stars:** `stars.6.json` from [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn (BSD 3-Clause), based on XHIP (Anderson & Francis 2012, VizieR V/137D).
- **Fonts:** IBM Plex Sans Condensed and IBM Plex Mono ([SIL OFL 1.1](https://openfontlicense.org/)), via Google Fonts.
- **Mission and vehicle data:** NASA mission reports and press kits (including the Space Shuttle press kits, the Shuttle Crew Operations Manual and the NSTS reference manual), NASA/JPL, CNSA releases, and published SpaceX and ISRO figures.

## License

The code is released under the [MIT License](LICENSE). The third-party assets listed above keep their own licenses.
