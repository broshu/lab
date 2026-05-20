# Microscopic Current Simulation

This simulation demonstrates the microscopic principles of electrical current in a metal conductor, offering both a classical educational view and a physically accurate quantum view.

## Physics Principles

The application provides two distinct modes to understand the physics of electricity:

### 1. Exaggerated Mode (Classical Drude Model)
This is the traditional way current is taught in schools.
- **Nuclei**: Drawn as large, solid objects with wide spaces between them.
- **Electrons**: Act as classical "billiard balls." They bounce chaotically off the nuclei.
- **Current**: The drift velocity is artificially boosted so you can clearly see the electrons migrating in one direction under an electric field.

### 2. Realistic Mode (True Scale & Quantum Mechanics)
When you switch to Realistic Mode, the simulation adjusts to actual physical proportions and quantum rules (specifically applying Bloch's theorem for lattices):
- **Atomic vs. Nucleus Size**: 
  - The faint red circles represent the **Ion Cores** (the nucleus plus non-valence electrons). In a solid metal like copper, these are tightly packed and practically touching (~0.25 nm spacing). 
  - The bright red dots represent the actual **Atomic Nuclei**. In reality, a nucleus is roughly 100,000 times smaller than the atom. (Even at 1 pixel, it is drawn much larger than it would be in reality, but it illustrates the vast empty space inside an atom).
- **Quantum Scattering**: 
  - In a perfect lattice, electrons behave as quantum waves and pass *perfectly through* the densely packed ion cores without hitting them. 
  - Electrons only scatter when they hit "defects" or thermal vibrations (phonons). The average distance an electron travels before scattering (Mean Free Path) is about **40 nm**. On the scale of this simulation, 40 nm is several screens wide. Therefore, you will see electrons passing straight through the atoms and only occasionally randomizing their direction.
- **Real-World Speeds**:
  - **Thermal (Fermi) Velocity**: The speed at which electrons move randomly is extremely high, roughly **1,000,000 m/s** ($10^6$ m/s).
  - **Drift Velocity**: The macroscopic speed at which the "current" actually flows (e.g., at 10 Amps) is extremely slow, on the order of **0.1 mm/s** ($10^{-4}$ m/s).
  - **The Result**: The random thermal motion is **10 billion times faster** than the directional drift. In Realistic Mode, the drift is correctly scaled, making it physically impossible to see the current flowing with the naked eye. The electrons appear to simply vibrate in place!

## Controls

- **External Electric Field**: Adjust the slider to apply voltage.
- **Temperature**: Adjust the slider to change the temperature. Higher temperatures increase atomic vibration (phonons), which decreases the Mean Free Path (electrons scatter more frequently), visualizing how resistance increases with temperature.
- **Toggle Mode**: Switch between the intuitive classical model and the mind-bending reality of quantum solid-state physics.
