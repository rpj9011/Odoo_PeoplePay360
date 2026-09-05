// frontend/src/services/soundService.js
class SoundService {
    constructor() {
        this.sounds = {
            // Default notification sound
            default: '/sounds/notification.mp3',
            // Admin-to-employee notification sound (distinct)
            adminNotification: '/sounds/admin-notification.mp3',
            // Leave rejection sound
            leaveRejection: '/sounds/leave-rejection.mp3',
            // Policy update sound (unique for policy notifications)
            policyUpdate: '/sounds/policy-update.mp3'
        };
        
        this.audioContext = null;
        this.isEnabled = this.getSoundPreference();
    }

    // Get sound preference from sessionStorage
    getSoundPreference() {
        const saved = sessionStorage.getItem('notificationSoundEnabled');
        return saved !== null ? saved === 'true' : true; // Default to enabled
    }

    // Set sound preference
    setSoundPreference(enabled) {
        this.isEnabled = enabled;
        sessionStorage.setItem('notificationSoundEnabled', enabled.toString());
    }

    // Play notification sound
    playSound(soundType = 'default') {
        if (!this.isEnabled) return;

        try {
            const soundPath = this.sounds[soundType] || this.sounds.default;
            
            // Create audio element
            const audio = new Audio(soundPath);
            audio.volume = 0.5; // Set volume to 50%
            
            // Handle audio loading errors gracefully
            audio.onerror = () => {
                console.warn(`Failed to load sound: ${soundPath}`);
                // Fallback to system beep if available
                this.playSystemBeep();
            };
            
            // Play the sound
            audio.play().catch(error => {
                console.warn('Failed to play notification sound:', error);
                // Fallback to system beep
                this.playSystemBeep();
            });
            
        } catch (error) {
            console.warn('Error playing notification sound:', error);
            this.playSystemBeep();
        }
    }

    // Fallback system beep
    playSystemBeep() {
        try {
            // Create a simple beep using Web Audio API
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.5);
            
        } catch (error) {
            console.warn('Failed to play system beep:', error);
        }
    }

    // Play admin notification sound (distinct from regular notifications)
    playAdminNotificationSound() {
        this.playSound('adminNotification');
    }

    // Play leave rejection sound
    playLeaveRejectionSound() {
        this.playSound('leaveRejection');
    }

    // Play policy update sound
    playPolicyUpdateSound() {
        this.playSound('policyUpdate');
    }

    // Play regular notification sound
    playNotificationSound() {
        this.playSound('default');
    }
}

// Create singleton instance
const soundService = new SoundService();

export default soundService;

