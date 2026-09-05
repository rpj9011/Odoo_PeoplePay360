/**
 * Notification Sound Manager
 * Handles playing unique sounds for different notification types
 * Prevents sound spam with throttling
 */

class NotificationSoundManager {
  constructor() {
    // Initialize audio instances
    this.announcementSound = new Audio("/sounds/announcement.mp3");
    this.generalSound = new Audio("/sounds/notification.mp3");
    
    // Set volume (0.0 to 1.0)
    this.announcementSound.volume = 0.7;
    this.generalSound.volume = 0.7;
    
    // Throttling to prevent sound spam
    this.lastPlayed = 0;
    this.throttleMs = 1000; // Minimum 1 second between sounds
    
    // Track which sound is currently playing
    this.isPlaying = false;
  }

  /**
   * Play announcement sound
   * @returns {Promise<boolean>} Success status
   */
  async playAnnouncement() {
    return this.playSound(this.announcementSound, "announcement");
  }

  /**
   * Play general notification sound
   * @returns {Promise<boolean>} Success status
   */
  async playGeneral() {
    return this.playSound(this.generalSound, "general");
  }

  /**
   * Internal method to play sound with throttling
   * @param {HTMLAudioElement} audio - Audio element to play
   * @param {string} type - Type of notification for logging
   * @returns {Promise<boolean>} Success status
   */
  async playSound(audio, type) {
    const now = Date.now();
    
    // Check throttle
    if (now - this.lastPlayed < this.throttleMs) {
      console.log(`[Sound] Throttled ${type} sound (too soon)`);
      return false;
    }
    
    // Check if already playing
    if (this.isPlaying) {
      console.log(`[Sound] Skipped ${type} sound (already playing)`);
      return false;
    }
    
    try {
      this.isPlaying = true;
      this.lastPlayed = now;
      
      // Reset audio to start
      audio.currentTime = 0;
      
      // Play sound
      await audio.play();
      console.log(`[Sound] Played ${type} notification sound`);
      
      // Reset playing flag when sound ends
      audio.onended = () => {
        this.isPlaying = false;
      };
      
      return true;
    } catch (error) {
      this.isPlaying = false;
      
      // Handle common errors gracefully
      if (error.name === 'NotAllowedError') {
        console.log('[Sound] Play blocked - user interaction required first');
      } else if (error.name === 'NotSupportedError') {
        console.error('[Sound] Audio format not supported');
      } else {
        console.error(`[Sound] Failed to play ${type} sound:`, error.message);
      }
      
      return false;
    }
  }

  /**
   * Set volume for all sounds
   * @param {number} volume - Volume level (0.0 to 1.0)
   */
  setVolume(volume) {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.announcementSound.volume = clampedVolume;
    this.generalSound.volume = clampedVolume;
    console.log(`[Sound] Volume set to ${clampedVolume}`);
  }

  /**
   * Preload sounds (call on app init to avoid delays)
   */
  preload() {
    try {
      this.announcementSound.load();
      this.generalSound.load();
      console.log('[Sound] Sounds preloaded');
    } catch (error) {
      console.error('[Sound] Failed to preload sounds:', error);
    }
  }

  /**
   * Test announcement sound
   */
  async testAnnouncement() {
    console.log('[Sound] Testing announcement sound...');
    return this.playAnnouncement();
  }

  /**
   * Test general notification sound
   */
  async testGeneral() {
    console.log('[Sound] Testing general notification sound...');
    return this.playGeneral();
  }
}

// Create singleton instance
const soundManager = new NotificationSoundManager();

// Preload sounds on module load
soundManager.preload();

export default soundManager;
