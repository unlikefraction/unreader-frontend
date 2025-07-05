function createPlaybackSlider(containerSelector, onSpeedChange = null) {
  const playBackSlider = document.querySelector(containerSelector);
  const slider = playBackSlider.querySelector('.slider');
  const thumb = playBackSlider.querySelector('.thumb');
  const valueDisplay = thumb.querySelector('.value');

  let isDragging = false;
  let sliderRect;

  function widthToSpeed(widthPercent) {
    const speed = 0.5 + ((widthPercent - 40) / 60) * 1.5;
    return Math.round(speed * 10) / 10;
  }

  function speedToWidth(speed) {
    return 40 + ((speed - 0.5) / 1.5) * 60;
  }

  function getThumbWidthFromPosition(clientX) {
    const rect = sliderRect;
    const relativeX = clientX - rect.left;
    const clickPercentage = (relativeX / rect.width) * 100;
    const thumbOffset = -7;
    const centeredWidth = clickPercentage - thumbOffset;
    return Math.max(40, Math.min(100, centeredWidth));
  }
  
  function updateSliderDisplay(widthPercent) {
    thumb.style.width = widthPercent + '%';
    const speed = widthToSpeed(widthPercent);
    valueDisplay.textContent = speed.toFixed(1);
    if (onSpeedChange) onSpeedChange(speed);
  }

  function updateSlider(clientX) {
    const pct = getThumbWidthFromPosition(clientX);
    updateSliderDisplay(pct);
  }

  function handleMouseDown(e) {
    isDragging = true;
    sliderRect = slider.getBoundingClientRect();
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
    updateSlider(e.clientX);
  }

  function handleMouseMove(e) {
    if (!isDragging) return;
    updateSlider(e.clientX);
  }

  function handleMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  function handleTouchStart(e) {
    isDragging = true;
    sliderRect = slider.getBoundingClientRect();
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    e.preventDefault();
    updateSlider(e.touches[0].clientX);
  }

  function handleTouchMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    updateSlider(e.touches[0].clientX);
  }

  function handleTouchEnd() {
    isDragging = false;
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
  }

  function init() {
    const initialWidth = speedToWidth(1.0);
    updateSliderDisplay(initialWidth);
    thumb.addEventListener('mousedown', handleMouseDown);
    slider.addEventListener('mousedown', handleMouseDown);
    thumb.addEventListener('touchstart', handleTouchStart);
    slider.addEventListener('touchstart', handleTouchStart);
  }

  const api = {
    getCurrentSpeed() {
      return parseFloat(valueDisplay.textContent);
    },
    setSpeed(speed) {
      const constrainedSpeed = Math.max(0.5, Math.min(2.0, speed));
      const width = speedToWidth(constrainedSpeed);
      updateSliderDisplay(width);
    },
    destroy() {
      thumb.removeEventListener('mousedown', handleMouseDown);
      slider.removeEventListener('mousedown', handleMouseDown);
      thumb.removeEventListener('touchstart', handleTouchStart);
      slider.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    }
  };

  init();
  return api;
}

function connectToAudio() {
  if (window.audioSetup) {
    const sliderAPI = createPlaybackSlider('.playBack', speed => {
      window.audioSetup.setPlaybackSpeed(speed);
    });
    console.log('🔗 Speed slider connected to audio');
    return sliderAPI;
  } else {
    setTimeout(connectToAudio, 100);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', connectToAudio);
} else {
  connectToAudio();
}


// === Enhanced Howler Output Routing & Device Selection ===
(async function() {
    // Create or get the audio element for Howler output
    let howlerOutput = document.getElementById('howler-output');
    if (!howlerOutput) {
      howlerOutput = new Audio();
      howlerOutput.autoplay = true;
      howlerOutput.id = 'howler-output';
      document.body.appendChild(howlerOutput);
    }
  
    // Route Howler's Web Audio through our custom audio element
    if (Howler.usingWebAudio && Howler.ctx && Howler.masterGain) {
      const dest = Howler.ctx.createMediaStreamDestination();
      Howler.masterGain.connect(dest);
      howlerOutput.srcObject = dest.stream;
      console.log('🔗 Howler output routed to custom audio element');
    }
  
    // Select elements for device lists
    const outputSelect = document.querySelector('#output-device select.device-select');
    const inputSelect  = document.querySelector('#input-device  select.device-select');
    let currentStream;
  
    // Set the chosen input device (no further processing for now)
    async function setInput(id) {
      if (currentStream) currentStream.getTracks().forEach(t => t.stop());
      try {
        currentStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: id }}});
        console.log(`🎤 Input device selected: ${id}`);
        // No additional input handling at this time
      } catch (e) {
        console.error('Input device error:', e);
      }
    }
  
    // Set the chosen output device for Howler and fallback for other audio elements
    async function setOutput(id) {
      if (howlerOutput.setSinkId) {
        try {
          await howlerOutput.setSinkId(id);
          console.log(`🔈 Output device set to: ${id}`);
        } catch(e) {
          console.warn('sinkId failed on Howler output:', e);
        }
      } else {
        document.querySelectorAll('audio').forEach(async audio => {
          if (audio.setSinkId) {
            try { await audio.setSinkId(id); }
            catch(err){ console.warn('sinkId fallback failed', err); }
          }
        });
      }
    }
  
    // Refresh available devices in the select lists
    async function refreshDevices() {
      const devices = await navigator.mediaDevices.enumerateDevices();
      outputSelect.innerHTML = '';
      inputSelect.innerHTML  = '';
      devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.text  = d.label || d.kind;
        if (d.kind === 'audioinput')  inputSelect.append(opt);
        if (d.kind === 'audiooutput') outputSelect.append(opt);
      });
    }
  
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    await refreshDevices();
  
    // Wire up change events
    inputSelect.addEventListener('change', () => setInput(inputSelect.value));
    outputSelect.addEventListener('change', () => setOutput(outputSelect.value));
  
    // Trigger default selection
    if (inputSelect.options.length)  inputSelect.dispatchEvent(new Event('change'));
    if (outputSelect.options.length) outputSelect.dispatchEvent(new Event('change'));
  })();
  

// grab the gear button and the dialog
const gearBtn   = document.querySelector('.settings.control');
const settingsD = document.querySelector('.settingsDialog');

gearBtn.addEventListener('click', () => {
  // flip the “active” class
  settingsD.classList.toggle('active');
  // optional: animate the gear icon or mark it active
  gearBtn.classList.toggle('active');
});


document.addEventListener('click', e => {
    if (!settingsD.contains(e.target) && !gearBtn.contains(e.target)) {
      settingsD.classList.remove('active');
      gearBtn.classList.remove('active');
    }
  });
  