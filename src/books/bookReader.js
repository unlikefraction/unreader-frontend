import MultiPageReader from './multiPageReader.js';
(async () => {
    const reader = new MultiPageReader([
        { audioFile: '/audio/suckAtReading_1.wav', timingFile: '/order/word_timings_ordered_1.json', textFile: '/transcript/landing_1.html', offsetMs: -100, pageKey: 'chapter-1' },
        { audioFile: '/audio/suckAtReading_2.wav', timingFile: '/order/word_timings_ordered_2.json', textFile: '/transcript/landing_2.html', offsetMs: -100, pageKey: 'chapter-2' },
        { audioFile: '/audio/suckAtReading_3.wav', timingFile: '/order/word_timings_ordered_3.json', textFile: '/transcript/landing_3.html', offsetMs: -100, pageKey: 'chapter-3' }
    ], { autoPlayFirst: false });
    
    await reader.init();
    window.reader = reader;
})();