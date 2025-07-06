/**
 * Keyboard shortcuts for drawing tools and audio controls
 */

// Drawing Tool Shortcuts Configuration
const DRAWING_SHORTCUTS = {
  'KeyV': 'cursor',
  'KeyR': 'rectangle', 
  'KeyA': 'arrow',
  'KeyL': 'line',
  'KeyE': 'eraser',
  'KeyP': 'pencil',
  'KeyH': 'highlighter',
  'KeyO': 'circle',
  'KeyT': 'text'
};

const AUDIO_SHORTCUTS = {
  'Space': 'playPause',
  'ArrowRight': 'forward',
  'ArrowLeft': 'rewind'
};

const SETTINGS = {
  enabled: true,
  preventInInputs: true
};

// Check if target is an input field where we should skip shortcuts
function isInputField(target) {
  const inputTypes = ['INPUT', 'TEXTAREA', 'SELECT'];
  return inputTypes.includes(target.tagName) || 
         target.contentEditable === 'true' ||
         target.isContentEditable ||
         target.classList.contains('annotation-text-editor');
}

// Get the active audio system (supports both old and new systems)
function getAudioSystem() {
  // Try new modular system first
  if (window.audioSystem) {
    return window.audioSystem;
  }
  // Fall back to old system for backward compatibility
  if (window.audioSetup) {
    return window.audioSetup;
  }
  return null;
}

// Get the drawing system
function getDrawingSystem() {
  return window.drawer || null;
}

// Handle drawing tool shortcuts
function handleDrawingShortcut(toolClass) {
  const drawer = getDrawingSystem();
  if (!drawer) {
    console.warn('Drawing system not available');
    return false;
  }

  const tool = document.querySelector(`.w-control.${toolClass}`);
  if (tool) {
    drawer.setActiveTool(tool);
    console.log(`🎨 Switched to ${toolClass} tool`);
    return true;
  } else {
    console.warn(`Tool with class ${toolClass} not found`);
    return false;
  }
}

// Handle audio shortcuts
function handleAudioShortcut(audioAction) {
  const audioSystem = getAudioSystem();
  if (!audioSystem) {
    console.warn('Audio system not available');
    return false;
  }

  switch (audioAction) {
    case 'playPause':
      // Use the appropriate method based on system type
      if (audioSystem.toggle) {
        audioSystem.toggle();
      } else if (audioSystem.toggleAudio) {
        audioSystem.toggleAudio();
      }
      console.log('🎵 Toggled audio playback');
      return true;
      
    case 'forward':
      if (audioSystem.forward) {
        audioSystem.forward();
        console.log('⏭️ Audio forward +10s');
      }
      return true;
      
    case 'rewind':
      if (audioSystem.rewind) {
        audioSystem.rewind();
        console.log('⏮️ Audio rewind -10s');
      }
      return true;
      
    default:
      console.warn(`Unknown audio action: ${audioAction}`);
      return false;
  }
}

// Wait for systems to be ready
function waitForSystems(callback, maxAttempts = 50) {
  let attempts = 0;
  
  const checkSystems = () => {
    attempts++;
    
    const audioReady = getAudioSystem() !== null;
    const drawingReady = getDrawingSystem() !== null;
    
    if (audioReady && drawingReady) {
      console.log('✅ All systems ready for shortcuts');
      callback();
      return;
    }
    
    if (attempts >= maxAttempts) {
      console.warn('⚠️ Timeout waiting for systems to be ready');
      console.log(`Audio system: ${audioReady ? 'Ready' : 'Not ready'}`);
      console.log(`Drawing system: ${drawingReady ? 'Ready' : 'Not ready'}`);
      callback(); // Proceed anyway
      return;
    }
    
    setTimeout(checkSystems, 100);
  };
  
  checkSystems();
}

// Initialize shortcuts
function initializeShortcuts() {
  console.log('⌨️ Initializing keyboard shortcuts...');
  
  // Main keydown event listener
  document.addEventListener('keydown', (e) => {
    if (!SETTINGS.enabled) return;
    
    // Skip if user is typing in input fields
    if (SETTINGS.preventInInputs && isInputField(e.target)) return;
    
    // Handle reload shortcut (Ctrl+R / Cmd+R)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      console.log('🔄 Reloading page...');
      window.location.reload();
      return;
    }
    
    // Handle drawing tool shortcuts
    const toolClass = DRAWING_SHORTCUTS[e.code];
    if (toolClass) {
      e.preventDefault();
      handleDrawingShortcut(toolClass);
      return;
    }
    
    // Handle audio shortcuts
    const audioAction = AUDIO_SHORTCUTS[e.code];
    if (audioAction) {
      e.preventDefault();
      handleAudioShortcut(audioAction);
      return;
    }
  });
  
  // Log available shortcuts
  console.log('📋 Available shortcuts:');
  console.log('Drawing tools:', Object.entries(DRAWING_SHORTCUTS).map(([key, tool]) => `${key} → ${tool}`));
  console.log('Audio controls:', Object.entries(AUDIO_SHORTCUTS).map(([key, action]) => `${key} → ${action}`));
  console.log('Other: Ctrl+R → reload');
}

// Public API for controlling shortcuts
export const ShortcutManager = {
  enable() {
    SETTINGS.enabled = true;
    console.log('✅ Shortcuts enabled');
  },
  
  disable() {
    SETTINGS.enabled = false;
    console.log('❌ Shortcuts disabled');
  },
  
  toggle() {
    SETTINGS.enabled = !SETTINGS.enabled;
    console.log(`🔄 Shortcuts ${SETTINGS.enabled ? 'enabled' : 'disabled'}`);
  },
  
  setPreventInInputs(prevent) {
    SETTINGS.preventInInputs = prevent;
    console.log(`🎯 Prevent shortcuts in inputs: ${prevent}`);
  },
  
  isEnabled() {
    return SETTINGS.enabled;
  },
  
  getShortcuts() {
    return {
      drawing: { ...DRAWING_SHORTCUTS },
      audio: { ...AUDIO_SHORTCUTS }
    };
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    waitForSystems(initializeShortcuts);
  });
} else {
  waitForSystems(initializeShortcuts);
}

// Make ShortcutManager globally available
window.ShortcutManager = ShortcutManager;