document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById('simulationCanvas');
    const ctx = canvas.getContext('2d');
    
    const electricFieldSlider = document.getElementById('electricField');
    const electricFieldValue = document.getElementById('electricFieldValue');
    const temperatureSlider = document.getElementById('temperature');
    const temperatureValue = document.getElementById('temperatureValue');
    const modeBtn = document.getElementById('modeBtn');
    const resetBtn = document.getElementById('resetBtn');
    const modeDescription = document.getElementById('modeDescription');

    let animationId;
    
    // Simulation parameters
    let electricField = 0; // V/m
    let temperatureK = 300; // Kelvin
    let isRealisticMode = false;
    
    const nuclei = [];
    const electrons = [];
    
    // Configurations for the two modes
    const CONFIG = {
        exaggerated: {
            spacing: 80,
            nucleusRadius: 15,
            electronRadius: 4,
            q_over_m: 0.08,
            numElectrons: 120,
            classicalScattering: true,
            speedFactor: 1,
            description: `<b>Exaggerated Mode (Classical Drude Model):</b><br>
                - <b>Drift Velocity:</b> Exaggerated to clearly show current.<br>
                - <b>Scattering:</b> Electrons act as classical particles bouncing off "solid" nuclei.<br>
                - <b>Size:</b> Nuclei are drawn small and widely spaced for visibility.`
        },
        realistic: {
            // At this scale, 1 pixel is roughly 0.008 nm.
            spacing: 32, // Copper lattice spacing is ~0.25 nm (32 pixels)
            ionCoreRadius: 15, // Atoms are tightly packed, nearly touching
            electronRadius: 2, // Approaching a point particle
            q_over_m: 0.0000001, // Drift is near zero visually
            numElectrons: 400, // More electrons because the lattice is denser
            classicalScattering: false, // Quantum Bloch wave behavior
            mfpPixels: 5000, // Mean Free Path is ~40 nm (5000 pixels)
            speedFactor: 1.5,
            description: `<b>Realistic Mode (Quantum & True Scale):</b><br>
                - <b>Sizes:</b> The faint red areas are <b>Ion Cores</b> (~0.25nm), tightly packed. The bright red dots are the actual <b>Nuclei</b> (100,000x smaller in reality).<br>
                - <b>Speeds:</b> Thermal speed (~1,000,000 m/s) completely dwarfs Drift speed (~0.1 mm/s at 10 Amps). The directional current is imperceptible.<br>
                - <b>Scattering:</b> Electrons are quantum waves. They pass perfectly <i>through</i> the lattice without bouncing. They only scatter off thermal vibrations (phonons) every ~40nm (far off-screen).`
        }
    };
    
    let currentConfig = CONFIG.exaggerated;
    
    class Nucleus {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.baseX = x;
            this.baseY = y;
            this.phase = Math.random() * Math.PI * 2;
        }
        
        update() {
            // Thermal vibration (amplitude scales roughly with sqrt of Temperature)
            const tempRatio = Math.sqrt(temperatureK / 300);
            const vibrationAmp = 3 * tempRatio * (isRealisticMode ? 0.2 : 0.4);
            this.x = this.baseX + Math.sin(this.phase) * vibrationAmp;
            this.y = this.baseY + Math.cos(this.phase) * vibrationAmp;
            this.phase += (isRealisticMode ? 0.4 : 0.2);
        }
        
        draw(ctx) {
            if (isRealisticMode) {
                // Draw Ion Core (Electron cloud minus conduction electron)
                ctx.beginPath();
                ctx.arc(this.x, this.y, currentConfig.ionCoreRadius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 100, 100, 0.15)';
                ctx.fill();
                
                // Draw literal Nucleus (Extremely small)
                ctx.beginPath();
                ctx.arc(this.x, this.y, 1.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
                ctx.fill();
            } else {
                // Draw classical exaggerated nucleus
                ctx.beginPath();
                ctx.arc(this.x, this.y, currentConfig.nucleusRadius, 0, Math.PI * 2);
                ctx.fillStyle = '#ff4d4d'; 
                ctx.fill();
                
                ctx.fillStyle = 'white';
                ctx.font = 'bold 18px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('+', this.x, this.y);
            }
        }
    }
    
    class Electron {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.randomizeVelocity();
            const brightness = Math.floor(180 + Math.random() * 75);
            this.color = isRealisticMode ? `rgba(50, 150, ${brightness}, 0.7)` : `rgb(50, 150, ${brightness})`;
        }
        
        randomizeVelocity() {
            // Quantum Gas (Realistic): thermal speed is Fermi velocity, mostly constant vs T
            // Classical Gas (Exaggerated): thermal speed proportional to sqrt(T)
            const baseSpeed = isRealisticMode ? 3 : 3 * Math.sqrt(temperatureK / 300);
            const speed = baseSpeed * currentConfig.speedFactor * (0.8 + Math.random() * 0.4);
            const angle = Math.random() * Math.PI * 2;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
        }
        
        update() {
            const ax = -electricField * currentConfig.q_over_m; 
            
            this.vx += ax;
            this.x += this.vx;
            this.y += this.vy;
            
            // Boundary collision
            if (this.x < 0) {
                this.x += canvas.width;
            } else if (this.x > canvas.width) {
                this.x -= canvas.width;
            }
            
            if (this.y < 0) {
                this.y = 0;
                this.vy *= -1;
            } else if (this.y > canvas.height) {
                this.y = canvas.height;
                this.vy *= -1;
            }
            
            if (currentConfig.classicalScattering) {
                // Classical billiard-ball collision
                for (let n of nuclei) {
                    const dx = this.x - n.x;
                    const dy = this.y - n.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist < currentConfig.nucleusRadius + currentConfig.electronRadius) {
                        this.randomizeVelocity();
                        this.x = n.x + (dx / dist) * (currentConfig.nucleusRadius + currentConfig.electronRadius + 1);
                        this.y = n.y + (dy / dist) * (currentConfig.nucleusRadius + currentConfig.electronRadius + 1);
                    }
                }
            } else {
                // Quantum Mean Free Path (MFP) scattering
                const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                // MFP is roughly inversely proportional to Temperature (phonon scattering)
                const currentMFP = currentConfig.mfpPixels * (300 / temperatureK);
                // Probability of scattering in this frame = Distance traveled / MFP
                const scatterProb = speed / currentMFP; 
                
                if (Math.random() < scatterProb) {
                    this.randomizeVelocity();
                }
            }
        }
        
        draw(ctx) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, currentConfig.electronRadius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            
            if (!isRealisticMode) {
                ctx.fillStyle = 'white';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('-', this.x, this.y);
            }
        }
    }
    
    function init() {
        nuclei.length = 0;
        electrons.length = 0;
        
        // Create nuclei lattice
        for (let x = currentConfig.spacing / 2; x < canvas.width; x += currentConfig.spacing) {
            for (let y = currentConfig.spacing / 2; y < canvas.height; y += currentConfig.spacing) {
                nuclei.push(new Nucleus(x, y));
            }
        }
        
        // Create electrons
        for (let i = 0; i < currentConfig.numElectrons; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            electrons.push(new Electron(x, y));
        }
        
        if (!animationId) {
            animate();
        }
    }
    
    function animate() {
        // Clear background
        ctx.fillStyle = isRealisticMode ? '#f0f0f0' : 'rgba(20, 20, 20, 0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        for (let n of nuclei) {
            n.update();
            n.draw(ctx);
        }
        
        for (let e of electrons) {
            e.update();
            e.draw(ctx);
        }
        
        if (Math.abs(electricField) > 0.1) {
            drawElectricFieldIndicator();
        }
        
        animationId = requestAnimationFrame(animate);
    }
    
    function drawElectricFieldIndicator() {
        ctx.save();
        ctx.fillStyle = isRealisticMode ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.5)';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        
        const arrowLength = Math.min(Math.abs(electricField) * 15, 150);
        const startX = canvas.width / 2 - (electricField > 0 ? arrowLength/2 : -arrowLength/2);
        const endX = canvas.width / 2 + (electricField > 0 ? arrowLength/2 : -arrowLength/2);
        const y = 30;
        
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.strokeStyle = isRealisticMode ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.beginPath();
        if (electricField > 0) {
            ctx.moveTo(endX, y);
            ctx.lineTo(endX - 10, y - 5);
            ctx.lineTo(endX - 10, y + 5);
        } else {
            ctx.moveTo(endX, y);
            ctx.lineTo(endX + 10, y - 5);
            ctx.lineTo(endX + 10, y + 5);
        }
        ctx.fill();
        
        ctx.fillText(`Electric Field E`, canvas.width / 2, y + 25);
        ctx.restore();
    }
    
    // Event listeners
    electricFieldSlider.addEventListener('input', (e) => {
        electricField = parseFloat(e.target.value);
        electricFieldValue.textContent = electricField;
    });
    
    temperatureSlider.addEventListener('input', (e) => {
        const oldTemp = temperatureK;
        temperatureK = parseFloat(e.target.value);
        temperatureValue.textContent = temperatureK;
        
        if (!isRealisticMode) {
            // Classical mode: adjust current electron speeds
            const ratio = Math.sqrt(temperatureK / oldTemp);
            for(let electron of electrons) {
                 electron.vx *= ratio;
                 electron.vy *= ratio;
            }
        }
    });

    modeBtn.addEventListener('click', () => {
        isRealisticMode = !isRealisticMode;
        currentConfig = isRealisticMode ? CONFIG.realistic : CONFIG.exaggerated;
        
        if (isRealisticMode) {
            modeBtn.textContent = "Switch to Exaggerated Mode";
            modeBtn.style.backgroundColor = "#ffc107"; // Yellow for warning
            modeBtn.style.color = "#212529";
        } else {
            modeBtn.textContent = "Switch to Realistic Mode";
            modeBtn.style.backgroundColor = "#28a745"; // Green for safe
            modeBtn.style.color = "white";
        }
        
        modeDescription.innerHTML = currentConfig.description;
        
        // Re-initialize to apply new spatial scales and electron counts
        init();
    });
    
    resetBtn.addEventListener('click', () => {
        electricFieldSlider.value = 0;
        temperatureSlider.value = 300;
        electricField = 0;
        temperatureK = 300;
        electricFieldValue.textContent = "0";
        temperatureValue.textContent = "300";
        if (isRealisticMode) {
            modeBtn.click(); // Reset mode too
        } else {
            init(); // Just reset positions
        }
    });
    
    // Start simulation
    modeDescription.innerHTML = currentConfig.description;
    init();
});