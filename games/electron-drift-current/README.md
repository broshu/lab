# Electron Drift in a Copper Wire

Open `index.html` to see conduction electrons inside a metal under an applied voltage. Two modes are provided.

- **Demo (visible drift)** — the random thermal motion and the drift velocity are both at human-friendly speeds, with drift exaggerated so the net flow direction is obvious to the eye.
- **Real copper (SI)** — a 120 nm × 57 nm slice of copper at 293 K. All parameters are in SI units and match Drude theory for copper: electron density `n = 8.46 × 10²⁸ m⁻³`, resistivity `ρ = 1.68 × 10⁻⁸ Ω·m`, Fermi speed `v_F = 1.57 × 10⁶ m/s`, mean free time `τ = m/(n e² ρ) ≈ 2.5 × 10⁻¹⁴ s`, mean free path `λ ≈ 39 nm`. The animation runs at roughly 1 fs per frame.

Both modes share the same Drude integrator:

- between collisions, an electron accelerates as `dv/dt = qE/m`,
- collisions are a Poisson process with mean time `τ`, after which the velocity is reset to a random direction at the thermal (Fermi) speed,
- the drift velocity that emerges from this is `v_d = eEτ/m`.

The folder follows the same structure as `games/oscilloscope-principle/`:

- `index.html`
- `css/style.css`
- `js/main.js`
