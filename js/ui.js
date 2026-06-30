// UI and Screen Effects Manager for Joust Royale

export class UIManager {
    constructor(callbacks = {}) {
        this.callbacks = callbacks;
        
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

        // Cache DOM elements immediately
        this.cacheDOM();
        // Then attach listeners when ready
        this.attachListeners();
    }

    cacheDOM() {
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

    attachListeners() {
        const blurActive = () => {
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }
        };

        // Main Menu - ENTER ARENA
        if (this.dom.btnStart) {
            this.dom.btnStart.addEventListener('click', () => {
                console.log('[UI] ENTER ARENA clicked');
                blurActive();
                this.callbacks.onStartGame();
            });
        }
        
        // Main Menu - ONLINE 1v1
        if (this.dom.btnOnline) {
            this.dom.btnOnline.addEventListener('click', () => {
                console.log('[UI] ONLINE 1v1 clicked');
                blurActive();
                this.showOverlay('online');
            });
        }
        
        // Main Menu - THE JET STABLES
        if (this.dom.btnStableMain) {
            this.dom.btnStableMain.addEventListener('click', () => {
                console.log('[UI] THE JET STABLES clicked');
                blurActive();
                this.showOverlay('stable');
            });
        }
        
        // Stable Menu - BACK TO MENU
        if (this.dom.btnStableBack) {
            this.dom.btnStableBack.addEventListener('click', () => {
                console.log('[UI] BACK TO MENU clicked');
                blurActive();
                this.showOverlay('main');
            });
        }
        
        // Stable Menu - START JOUST
        if (this.dom.btnStableStart) {
            this.dom.btnStableStart.addEventListener('click', () => {
                console.log('[UI] START JOUST clicked');
                blurActive();
                this.callbacks.onStartGame();
            });
        }
        
        // Wave Clear - NEXT WAVE
        if (this.dom.btnNextWave) {
            this.dom.btnNextWave.addEventListener('click', () => {
                console.log('[UI] NEXT WAVE clicked');
                blurActive();
                this.callbacks.onNextWave();
            });
        }
        
        // Wave Clear - VISIT STABLES
        if (this.dom.btnStableLoot) {
            this.dom.btnStableLoot.addEventListener('click', () => {
                console.log('[UI] VISIT STABLES (loot) clicked');
                blurActive();
                this.showOverlay('stable');
            });
        }
        
        // Game Over - JOUST AGAIN
        if (this.dom.btnRetry) {
            this.dom.btnRetry.addEventListener('click', () => {
                console.log('[UI] JOUST AGAIN clicked');
                blurActive();
                this.callbacks.onResetGame();
            });
        }
        
        // Game Over - VISIT STABLES
        if (this.dom.btnStableGo) {
            this.dom.btnStableGo.addEventListener('click', () => {
                console.log('[UI] VISIT STABLES (go) clicked');
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
                console.log('[UI] Buy upgrade:', type);
                this.callbacks.onBuyUpgrade(type);
            });
        });
    }

    showOverlay(name) {
        console.log('[UI] showOverlay:', name);
        
        // Hide all overlays first
        if (this.dom.mainMenu) this.dom.mainMenu.classList.add('hidden');
        if (this.dom.stableMenu) this.dom.stableMenu.classList.add('hidden');
        if (this.dom.waveClearMenu) this.dom.waveClearMenu.classList.add('hidden');
        if (this.dom.gameOverMenu) this.dom.gameOverMenu.classList.add('hidden');
        if (this.dom.onlineMenu) this.dom.onlineMenu.classList.add('hidden');
        if (this.dom.hud) this.dom.hud.classList.add('hidden');

        // Stop active screen shake on entering any menu overlay
        if (name !== 'game') {
            this.shakeTime = 0;
            this.shakeIntensity = 0;
            this.shakeOffset = { x: 0, y: 0 };
            if (this.dom.container) this.dom.container.classList.remove('shake-active');
        }

        // Show requested
        if (name === 'game') {
            if (this.dom.hud) this.dom.hud.classList.remove('hidden');
        } else if (name === 'main') {
            if (this.dom.mainMenu) this.dom.mainMenu.classList.remove('hidden');
        } else if (name === 'stable') {
            if (this.dom.stableMenu) this.dom.stableMenu.classList.remove('hidden');
            if (this.callbacks.onOpenStable) this.callbacks.onOpenStable();
        } else if (name === 'waveClear') {
            if (this.dom.waveClearMenu) this.dom.waveClearMenu.classList.remove('hidden');
        } else if (name === 'gameOver') {
            if (this.dom.gameOverMenu) this.dom.gameOverMenu.classList.remove('hidden');
        } else if (name === 'online') {
            if (this.dom.onlineMenu) this.dom.onlineMenu.classList.remove('hidden');
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
            if (this.dom.container) this.dom.container.classList.add('shake-active');
            
            this.shakeTime--;
            if (this.shakeTime <= 0) {
                this.shakeOffset.x = 0;
                this.shakeOffset.y = 0;
                if (this.dom.container) this.dom.container.classList.remove('shake-active');
            }
        }
    }

    /**
     * Update HUD stats during active game
     */
    updateHUD(player, wave, enemiesLeft, gold) {
        // Health bar
        const healthPercent = (player.health / player.maxHealth) * 100;
        if (this.dom.healthFill) this.dom.healthFill.style.width = `${healthPercent}%`;

        // Boost/stamina bar
        const boostPercent = (player.boostStamina / player.maxBoostStamina) * 100;
        if (this.dom.boostFill) this.dom.boostFill.style.width = `${boostPercent}%`;

        // Speed conversion (speed * 15 km/h for gamer feeling)
        const currentSpeed = Math.round(Math.sqrt(player.vel.x * player.vel.x + player.vel.y * player.vel.y) * 15);
        if (this.dom.speedVal) this.dom.speedVal.innerText = currentSpeed;

        // Damage Multiplier based on current velocity along lance direction
        const speedRatio = Math.sqrt(player.vel.x * player.vel.x + player.vel.y * player.vel.y) / player.baseMaxSpeed;
        
        // Show current potential multiplier (1.0 to 10.0x)
        const multiplier = Math.max(1.0, 1.0 + speedRatio * 4.0);
        const cleanMult = multiplier.toFixed(1);
        if (this.dom.multiplier) this.dom.multiplier.innerText = `${cleanMult}x DMG`;

        // Pulse multiplier if speed ratio is high (charging!)
        if (speedRatio > 0.8) {
            if (this.dom.multiplier) this.dom.multiplier.classList.add('multiplier-pulse');
        } else {
            if (this.dom.multiplier) this.dom.multiplier.classList.remove('multiplier-pulse');
        }

        // Global stats
        if (this.dom.wave) this.dom.wave.innerText = wave;
        if (this.dom.enemies) this.dom.enemies.innerText = enemiesLeft;
        if (this.dom.gold) this.dom.gold.innerText = `$${Math.round(gold)}`;
    }

    /**
     * Render the Stable Upgrade Shop UI elements
     */
    updateStableShop(gold, upgradeLevels) {
        if (this.dom.shopGold) this.dom.shopGold.innerText = `$${Math.round(gold)}`;

        Object.keys(this.upgradeConfig).forEach(type => {
            const config = this.upgradeConfig[type];
            const currentLevel = upgradeLevels[type] || 0;
            const maxLvl = config.maxLvl;

            // DOM Elements inside the card
            const card = document.querySelector(`.upgrade-card[data-upgrade="${type}"]`);
            if (!card) return;
            
            const levelEl = document.getElementById(`lvl-${type}`);
            const barEl = document.getElementById(`bar-${type}`);
            const costEl = document.getElementById(`cost-${type}`);
            const btnEl = card.querySelector('.btn-buy');

            if (currentLevel >= maxLvl) {
                if (levelEl) levelEl.innerText = "MAX";
                if (barEl) barEl.style.width = "100%";
                if (costEl) costEl.innerText = "MAX LEVEL";
                if (btnEl) {
                    btnEl.innerText = "MAXED";
                    btnEl.classList.add('maxed');
                    btnEl.disabled = true;
                }
            } else {
                const cost = Math.round(config.baseCost * Math.pow(config.costMult, currentLevel));
                if (levelEl) levelEl.innerText = `Lvl ${currentLevel + 1}`;
                
                // Progress bar fill (level / maxLevel * 100)
                const percent = (currentLevel / maxLvl) * 100;
                if (barEl) barEl.style.width = `${percent}%`;
                if (costEl) costEl.innerText = `$${cost}`;
                
                // Enable or disable buy button
                if (btnEl) {
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
            }
        });
    }

    showWaveClear(wave, loot) {
        if (this.dom.waveClearNum) this.dom.waveClearNum.innerText = wave;
        if (this.dom.waveClearLoot) this.dom.waveClearLoot.innerText = `$${loot}`;
        this.showOverlay('waveClear');
    }

    showGameOver(wavesSurvived, maxSpeed, maxDmg) {
        if (this.dom.goWaves) this.dom.goWaves.innerText = wavesSurvived;
        if (this.dom.goMaxSpeed) this.dom.goMaxSpeed.innerText = `${Math.round(maxSpeed * 15)} km/h`;
        if (this.dom.goMaxDmg) this.dom.goMaxDmg.innerText = `${Math.round(maxDmg)} DMG`;
        this.showOverlay('gameOver');
    }

    showVictory() {
        if (this.dom.goWaves) this.dom.goWaves.innerText = '—';
        if (this.dom.goMaxSpeed) this.dom.goMaxSpeed.innerText = '—';
        if (this.dom.goMaxDmg) this.dom.goMaxDmg.innerText = '—';
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
        if (this.dom.goWaves) this.dom.goWaves.innerText = '—';
        if (this.dom.goMaxSpeed) this.dom.goMaxSpeed.innerText = '—';
        if (this.dom.goMaxDmg) this.dom.goMaxDmg.innerText = '—';
        const heading = this.dom.gameOverMenu.querySelector('h2');
        if (heading) {
            heading.className = 'text-red';
            heading.innerText = 'DISCONNECTED';
        }
        const desc = this.dom.gameOverMenu.querySelector('p');
        if (desc) desc.innerText = 'Opponent left the arena.';
        this.showOverlay('gameOver');
    }
