# Collision Deformation

Classroom demo for the collision lesson: the microscopic mechanism of elastic deformation, plastic deformation and fracture.

A rigid ball hits a thin plate clamped at both ends. The plate is about 370 particles that interact through a Morse-type force with the same shape as the textbook F–r curve. Rebound, permanent bending and cracking all come out of the simulation; none of it is scripted.

- Metal: any two particles that come close attract, so particles can slip and bond to new neighbours (plastic deformation).
- Glass: only the original bonds attract; a bond pulled past the cut-off never re-forms (brittle fracture).
- Presets: light hit (both elastic), medium hit (metal bends, glass cracks), hard hit (both break).
- Side panels: live F–r curve with every bond plotted as a dot, and the energy split (ball KE / molecular PE / particle KE) over time.
- The run always continues until the ball has flown out of the picture; once the ball has left the plate, playback speeds up ×3 automatically.
- Keys: Space launch/pause, R reset, 1/2/3 presets, M switch material.

Open `index.html` to run it.

The folder follows the same structure as `games/microscopic current/`:

- `index.html`
- `css/style.css`
- `js/physics.js` (particle model, no DOM)
- `js/main.js` (drawing and controls)
