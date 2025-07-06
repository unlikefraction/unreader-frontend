/**
 * Read-along functionality and text positioning
 */
export class ReadAlong {
    constructor(highlighter) {
      this.highlighter = highlighter;
      this.isActive = true;
      this.heightSetter = null;
      this.isDragging = false;
      this.startY = 0;
      this.startTop = 0;
      
      this.setupHeightSetter();
      this.setupReadAlongControl();
    }
  
    setupHeightSetter() {
      this.heightSetter = document.getElementById('heightSetter');
      if (!this.heightSetter) {
        console.warn('heightSetter element not found');
        return;
      }
  
      // Initialize heightSetter position if not set
      if (!this.heightSetter.style.top) {
        this.heightSetter.style.top = '50%';
      }
  
      this.setupHeightSetterDragging();
    }
  
    setupHeightSetterDragging() {
      if (!this.heightSetter) return;
  
      // Mouse events
      this.heightSetter.addEventListener('mousedown', (e) => {
        this.isDragging = true;
        this.startY = e.clientY;
        this.startTop = this.getCurrentTopPercent();
        
        // Change cursor to grabbing
        this.heightSetter.style.cursor = 'grabbing';
        
        // Prevent text selection and other default behaviors
        e.preventDefault();
      });
  
      document.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        
        // Calculate the difference in Y position
        const deltaY = e.clientY - this.startY;
        const viewportHeight = window.innerHeight;
        
        // Convert pixel difference to percentage
        const deltaPercent = (deltaY / viewportHeight) * 100;
        
        // Update position
        const newTop = this.startTop + deltaPercent;
        this.setTopPercent(newTop);
      });
  
      document.addEventListener('mouseup', () => {
        if (this.isDragging) {
          this.isDragging = false;
          this.heightSetter.style.cursor = 'grab';
        }
      });
  
      // Touch events for mobile support
      this.heightSetter.addEventListener('touchstart', (e) => {
        this.isDragging = true;
        this.startY = e.touches[0].clientY;
        this.startTop = this.getCurrentTopPercent();
        
        e.preventDefault();
      });
  
      document.addEventListener('touchmove', (e) => {
        if (!this.isDragging) return;
        
        const deltaY = e.touches[0].clientY - this.startY;
        const viewportHeight = window.innerHeight;
        const deltaPercent = (deltaY / viewportHeight) * 100;
        
        const newTop = this.startTop + deltaPercent;
        this.setTopPercent(newTop);
        
        e.preventDefault();
      });
  
      document.addEventListener('touchend', () => {
        if (this.isDragging) {
          this.isDragging = false;
        }
      });
    }
  
    // Get current top position as percentage
    getCurrentTopPercent() {
      if (!this.heightSetter) return 50;
      const currentTop = this.heightSetter.style.top || '50%';
      return parseFloat(currentTop.replace('%', ''));
    }
  
    // Set top position as percentage with 10% to 90% constraint
    setTopPercent(percent) {
      if (!this.heightSetter) return;
      
      // Clamp between 10% and 90% (not 0% to 100%)
      const clampedPercent = Math.max(10, Math.min(90, percent));
      this.heightSetter.style.top = `${clampedPercent}%`;
      
      // Update text position when heightSetter moves (only if read-along is active)
      setTimeout(() => {
        if (this.isActive && this.highlighter.currentHighlightedWord) {
          this.updateTextPosition();
        }
      }, 0);
    }
  
    setupReadAlongControl() {
      const readAlongControl = document.querySelector('.read-along.control');
      if (!readAlongControl) {
        console.warn('Read-along control not found');
        return;
      }
  
      readAlongControl.addEventListener('click', () => {
        this.toggle();
      });
    }
  
    toggle() {
      this.isActive = !this.isActive;
      
      const readAlongControl = document.querySelector('.read-along.control');
      if (readAlongControl) {
        if (this.isActive) {
          readAlongControl.classList.add('active');
        } else {
          readAlongControl.classList.remove('active');
        }
      }
      
      console.log(`📖 Read-along ${this.isActive ? 'enabled' : 'disabled'}`);
      
      // If just enabled and we have a current word, update position immediately
      if (this.isActive && this.highlighter.currentHighlightedWord) {
        this.updateTextPosition();
      }
    }
  
    updateTextPosition() {
      if (!this.isActive || !this.highlighter.currentHighlightedWord || !this.heightSetter) {
        return;
      }
      
      const heightSetterTop = this.getCurrentTopPercent();
      
      const wordRect = this.highlighter.currentHighlightedWord.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const targetY = (heightSetterTop / 100) * viewportHeight;
      
      const currentWordY = wordRect.top + window.scrollY;
      const desiredScrollY = currentWordY - targetY;
      
      window.scrollTo({
        top: desiredScrollY,
        behavior: 'smooth'
      });
    }
  
    // Method to be called when highlighting updates
    onWordHighlighted() {
      if (this.isActive) {
        this.updateTextPosition();
      }
    }
  }