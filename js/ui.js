// UI and Screen Effects Manager for Joust Royale

export class UIManager {
    constructor(callbacks = {}) {
        this.callbacks = callbacks;
        this.dom = {};
        
        // Upgrade costs & max levels definitions
        this.upgradeConfig = {
            speed: { baseCost: 100, costMult: 1.6, maxLvl: 5, name: "WARHORSE SPEED" },
            armor: { baseCost: 120, costMult: 1.7, maxLvl: 5, name: "PLATE ARMOR" },
            lance: { baseCost: 150, costMult: 1.8, maxLvl: 5, name: "REINFORCED LANCE" },
            sharpness: { baseCost: 100, costMult: 1.6, maxLvl: 5, name: "STEEL TIP" },
            boost: { baseCost: 80, costMult: 1.5, maxLvl: 5, name: "HORSE ENDURANCE" }
        };

        // Screen Shake State
        this.shakeTime = 0;
        this.shakeIntensity = 0;
        this.shakeOffset = { x: 0, y: 0 };

        // Last speed multiplier for pulsing
        this.lastDmgMult = 1.0;

        // Initialize DOM elements once document is ready
        this.cacheDOM();
        this.initEventListeners();
    }

    cacheDOM() {
        // Cache DOM elements
        this.dom = {
            container: document.getElementById('game-container'),
            hud: document.getElementById('hud'),
            healthFill: document.getElementById('hud-health'),
            boostFill: document.getElementById('hud-boost'),
            speedVal: document.getElementById('hud-speed-val'),
            multiplier: document.getElementById('hud-multiplier'),
            wave: document.getElementById('hud-wave'),
            enemies: document.getElementById('hud-enemies'),
            gold: document.getElementById('hud-gold'),
            
            // Overlays
            mainMenu: document.getElementById('main-menu'),
            stableMenu: document.getElementById('stable-menu'),
            waveClearMenu: document.getElementById('wave-clear-menu'),
            gameOverMenu: document.getElementById('game-over-menu'),
            onlineMenu: document.getElementById('online-menu'),
            
            // Buttons
            btnStart: document.getElementById('btn-start'),
            btnOnline: document.getElementById('btn-online'),
            btnStableMain: document.getElementById('btn-stable-main'),
            btnStableBack: document.getElementById('btn-stable-back'),
            btnStableStart: document.getElementById('btn-stable-start'),
            btnStableLoot: document.getElementById('btn-stable-loot'),
            btnStableGo: document.getElementById('btn-stable-go'),
            btnNextWave: document.getElementById('btn-next-wave'),
            btnRetry: document.getElementById('btn-retry'),
            
            // Shop Details
            shopGold: document.getElementById('shop-gold'),
            waveClearNum: document.getElementById('wave-clear-num'),
            waveClearLoot: document.getElementById('wave-clear-loot'),
            goWaves: document.getElementById('go-waves'),
            goMaxSpeed: document.getElementById('go-max-speed'),
            goMaxDmg: document.getElementById('go-max-dmg')
        };
    }

    initEventListeners() {
        const blurActive = () => {
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }
        };

        // Main Menu
        if (this.dom.btnStart) {
            this.dom.btnStart.addEventListener('click', () => {
                blurActive();
                this.callbacks.onStartGame();
            });
        }
        
        if (this.dom.btnOnline) {
            this.dom.btnOnline.addEventListener('click', () => {
                blurActive();
                this.showOverlay('online');
            });
        }
        
        if (this.dom.btnStableMain) {
            this.dom.btnStableMain.addEventListener('click', () => {
                blurActive();
                this.showOverlay('stable');
            });
        }
        
        // Stable Menu (Upgrade Shop)
        if (this.dom.btnStableBack) {
            this.dom.btnStableBack.addEventListener('click', () => {
                blurActive();
                this.showOverlay('main');
            });
        }
        
        if (this.dom.btnStableStart) {
            this.dom.btnStableStart.addEventListener('click', () => {
                blurActive();
                this.callbacks.onStartGame();
            });
        }
        
        // Wave Clear
        if (this.dom.btnNextWave) {
            this.dom.btnNextWave.addEventListener('click', () => {
                blurActive();
                this.callbacks.onNextWave();
            });
        }
        
        if (this.dom.btnStableLoot) {
            this.dom.btnStableLoot.addEventListener('click', () => {
                blurActive();
                this.showOverlay('stable');
            });
        }
        
        // Game Over
        if (this.dom.btnRetry) {
            this.dom.btnRetry.addEventListener('click', () => {
                blurActive();
                this.callbacks.onResetGame();
            });
        }
        
        if (this.dom.btnStableGo) {
            this.dom.btnStableGo.addEventListener('click', () => {
                blurActive();
                this.showOverlay('stable');
            });
        }

        // Bind all "Upgrade/Buy" buttons in stables
        const buyButtons = document.querySelectorAll('.btn-buy');
        buyButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                blurActive();
                const type = e.target.getAttribute('data-upgrade');
                this.callbacks.onBuyUpgrade(type);
            });
        });
    }

    showOverlay(name) {
        // Hide all overlays first
        this.dom.mainMenu.classList.add('hidden');
        this.dom.stableMenu.classList.add('hidden');
        this.dom.waveClearMenu.classList.add('hidden');
        this.dom.gameOverMenu.classList.add('hidden');
        this.dom.onlineMenu.classList.add('hidden');
        this.dom.hud.classList.add('hidden');

        // Stop active screen shake on entering any menu overlay
        if (name !== 'game') {
            this.shakeTime = 0;
            this.shakeIntensity = 0;
            this.shakeOffset = { x: 0, y: 0 };
            this.dom.container.classList.remove('shake-active');
        }

        // Show requested
        if (name === 'game') {
            this.dom.hud.classList.remove('hidden');
        } else if (name === 'main') {
            this.dom.mainMenu.classList.remove('hidden');
        } else if (name === 'stable') {
            this.dom.stableMenu.classList.remove('hidden');
            this.callbacks.onOpenStable(); // Trigger gold and button update
        } else if (name === 'waveClear') {
            this.dom.waveClearMenu.classList.remove('hidden');
        } else if (name === 'gameOver') {
            this.dom.gameOverMenu.classList.remove('hidden');
        } else if (name === 'online') {
            this.dom.onlineMenu.classList.remove('hidden');
        }
    }

    /**
     * Trigger a camera screen shake
     */
    triggerShake(intensity, durationFrames) {
        this.shakeIntensity = intensity;
        this.shakeTime = durationFrames;
    }

    updateEffects() {
        // Process screen shake decay
        if (this.shakeTime > 0) {
            this.shakeOffset.x = (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeOffset.y = (Math.random() - 0.5) * this.shakeIntensity;
            
            // Add visual shake effect class to HTML container to make HUD shake too
            this.dom.container.classList.add('shake-active');
            
            this.shakeTime--;
            if (this.shakeTime <= 0) {
                this.shakeOffset.x = 0;
                this.shakeOffset.y = 0;
                this.dom.container.classList.remove('shake-active');
            }
        }
    }

    /**
     * Update HUD stats during active game
     */
    updateHUD(player, wave, enemiesLeft, gold) {
        // Health bar
        const healthPercent = (player.health / player.maxHealth) * 100;
        this.dom.healthFill.style.width = `${healthPercent}%`;

        // Boost/stamina bar
        const boostPercent = (player.boostStamina / player.maxBoostStamina) * 100;
        this.dom.boostFill.style.width = `${boostPercent}%`;

        // Speed conversion (speed * 15 km/h for gamer feeling)
        const currentSpeed = Math.round(Math.sqrt(player.vel.x * player.vel.x + player.vel.y * player.vel.y) * 15);
        this.dom.speedVal.innerText = currentSpeed;

        // Damage Multiplier based on current velocity along lance direction
        // In the HUD we'll show potential damage multiplier relative to base speed (approx max player speed)
        const speedRatio = Math.sqrt(player.vel.x * player.vel.x + player.vel.y * player.vel.y) / player.baseMaxSpeed;
        
        // Show current potential multiplier (1.0 to 10.0x)
        const multiplier = Math.max(1.0, 1.0 + speedRatio * 4.0); // e.g. 5x potential on full charge
        const cleanMult = multiplier.toFixed(1);
        this.dom.multiplier.innerText = `${cleanMult}x DMG`;

        // Pulse multiplier if speed ratio is high (charging!)
        if (speedRatio > 0.8) {
            this.dom.multiplier.classList.add('multiplier-pulse');
        } else {
            this.dom.multiplier.classList.remove('multiplier-pulse');
        }

        // Global stats
        this.dom.wave.innerText = wave;
        this.dom.enemies.innerText = enemiesLeft;
        this.dom.gold.innerText = `$${Math.round(gold)}`;
    }

    /**
     * Render the Stable Upgrade Shop UI elements
     */
    updateStableShop(gold, upgradeLevels) {
        this.dom.shopGold.innerText = `$${Math.round(gold)}`;

        Object.keys(this.upgradeConfig).forEach(type => {
            const config = this.upgradeConfig[type];
            const currentLevel = upgradeLevels[type] || 0;
            const maxLvl = config.maxLvl;

            // DOM Elements inside the card
            const card = document.querySelector(`.upgrade-card[data-upgrade="${type}"]`);
            const levelEl = document.getElementById(`lvl-${type}`);
            const barEl = document.getElementById(`bar-${type}`);
            const costEl = document.getElementById(`cost-${type}`);
            const btnEl = card.querySelector('.btn-buy');

            if (currentLevel >= maxLvl) {
                levelEl.innerText = "MAX";
                barEl.style.width = "100%";
                costEl.innerText = "MAX LEVEL";
                btnEl.innerText = "MAXED";
                btnEl.classList.add('maxed');
                btnEl.disabled = true;
            } else {
                const cost = Math.round(config.baseCost * Math.pow(config.costMult, currentLevel));
                levelEl.innerText = `Lvl ${currentLevel + 1}`;
                
                // Progress bar fill (level / maxLevel * 100)
                const percent = (currentLevel / maxLvl) * 100;
                barEl.style.width = `${percent}%`;
                costEl.innerText = `$${cost}`;
                
                // Enable or disable buy button
                btnEl.innerText = "UPGRADE";
                btnEl.classList.remove('maxed');
                if (gold >= cost) {
                    btnEl.disabled = false;
                    btnEl.style.opacity = '1';
                } else {
                    btnEl.disabled = true;
                    btnEl.style.opacity = '0.5';
                }
            }
        });
    }

    showWaveClear(wave, loot) {
        this.dom.waveClearNum.innerText = wave;
        this.dom.waveClearLoot.innerText = `$${loot}`;
        this.showOverlay('waveClear');
    }

    showGameOver(wavesSurvived, maxSpeed, maxDmg) {
        this.dom.goWaves.innerText = wavesSurvived;
        this.dom.goMaxSpeed.innerText = `${Math.round(maxSpeed * 15)} km/h`;
        this.dom.goMaxDmg.innerText = `${Math.round(maxDmg)} DMG`;
        this.showOverlay('gameOver');
    }

    showVictory() {
        this.dom.goWaves.innerText = '—';
        this.dom.goMaxSpeed.innerText = '—';
        this.dom.goMaxDmg.innerText = '—';
        const heading = this.dom.gameOverMenu.querySelector('h2');
        if (heading) {
            heading.className = 'text-gold animate-bounce';
            heading.innerText = 'VICTORY!';
        }
        const desc = this.dom.gameOverMenu.querySelector('p');
        if (desc) desc.innerText = 'You unhorsed your opponent! Well jousted, knight.';
        this.showOverlay('gameOver');
    }

    showOnlineDisconnected() {
        this.dom.goWaves.innerText = '—';
        this.dom.goMaxSpeed.innerText = '—';
        this.dom.goMaxDmg.innerText = '—';
        const heading = this.dom.gameOverMenu.querySelector('h2');
        if (heading) {
            heading.className = 'text-red';
            heading.innerText = 'DISCONNECTED';
        }
        const desc = this.dom.gameOverMenu.querySelector('p');
        if (desc) desc.innerText = 'Opponent left the arena.';
        this.showOverlay('gameOver');
    }
